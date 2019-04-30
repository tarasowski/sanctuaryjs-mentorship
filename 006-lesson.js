const AWS = require("aws-sdk")
const S = require("./sanctuary.js")
const {
  putItem,
  getItem,
  updateItem,
  cParamsSKU,
  cParamsVersion,
  cProducerParams,
  cAutoPublishingParams,
  updateSKUStatusParams,
  cGetSKUStatusParams,
  cUpdateSKUStatusParams,
  cVerificationParams,
  cPublishedVersionsParams,
  getItemFuture,
} = require("./utils/dynamodb.js")

const {
  publishMsg,
  snsAutoPublishParams,
} = require("./utils/sns.js")

const hash = require("object-hash")
const log = x => console.log(JSON.stringify(x, null, 2)) || x

const NODE_ENV = process.env.NODE_ENV || "dev"
const SKU_TABLE = process.env.SKU_TABLE || `FDHSKUs-${NODE_ENV}`
const SKU_VERSIONS_TABLE = process.env.SKU_VERSIONS_TABLE || `FDHSKUVersions-${NODE_ENV}`
const INSPECTIONS_TABLE = process.env.INSPECTIONS_TABLE || `FDHInspections-${NODE_ENV}`
const PRODUCERS_TABLE = process.env.PRODUCERS_TABLE || `FDHProducers-${NODE_ENV}`
const SNS_XML_TOPIC = process.env.XML_TOPIC || "arn:aws:sns:eu-central-1:306098392847:BuildXML"


// the first thing we need to decide what the type should be
// we need to decide what our startegy is for error handling and the type will make it clear to us
// the next q: are we sure that Records always exist in the event object? We can use S.prop here, because AWS provides us the API
// S.Left should contain some error message. We represent an error as a value.
// If I don't need to know error messages, I can simply use Maybe a. Do I need more context or not
//    parseEvent :: Event -> Maybe NewImage
const parseEvent =
  S.pipe([
    S.prop ("Records"),
    S.head,
    S.filter (e => S.prop ("eventName") (e) === "INSERT"), // can be applied to Maybe
    S.map (S.props (["dynamodb", "NewImage"])),
  ]) 


const producerId = S.props (["producerId", "S"]) 
const productId = S.props (["productId", "S"])
const skuId = S.props (["skuId", "S"])
const version = S.props (["version", "N"])
const dealerList = S.props (["Item", "dealers", "L"])

const basisData = event => ({
  productId: productId (event),
  skuId: skuId (event),
  version: version (event),
})



const handler = async (event, _, callback) => {
  //    parsedEvent :: Maybe NewImage
  const parsedEvent = parseEvent(event)

  const mapping = async newImage => {

    const newVersion = newImage.version.N

    //    producerData :: Future Error Object
    const producerData = getItemFuture(cProducerParams (producerId (newImage))
                                                       (PRODUCERS_TABLE))
    // S.props here is okay....
    //    dealers :: Future Error [Dealers]
    const dealers = S.map (S.props (["Item", "dealers", "L"])) (producerData)

    //    allowedToAutoPublishCheck :: Future Error [Dealers]
    const allowedToAutoPublishCheck = S.map (S.filter (S.props (["M", "autoPublish", "BOOL"]))) (dealers)

    //    allowedToAutoPublishDealerList :: Future Error [DealerId]
    const allowedToAutoPublishDealerList = S.map (S.map (S.props (["M", "dealerId", "S"]))) (allowedToAutoPublishCheck) 


    //    sku :: Future Error Object
    const sku = getItemFuture(cParamsSKU (SKU_TABLE) (newImage))

    //    filteredPublishedVersion :: Future Error [{DealerId, Version}]
    const filteredPublishedVersions = S.map (S.pipe([
      S.props (["Item", "status", "L"])
      S.filter (status => S.props (["M", "status", "S"]) (status) === "Published"),
      S.map (status => ({dealerId: S.props (["M", "dealerId", "S"]) (status), version: S.props (["M", "version", "N"]) (status)}))
    ])) (sku)


    //    versionsForComparison :: Future Error [{Dealerid, Version}]
    const versionsForComparison = S.lift2 (dealerList => S.filter (entry => S.elem (entry.dealerId) (dealerList)))
                                          (allowedToAutoPublishDealerList)
                                          (filteredPublishedVersions)

// sequence :: (Applicative f, Traversable t) => TypeRep f -> t (f a) -> f (t a)
   
    //    getPublishedVersions :: Future Error [Future Error Object]
    const getPublishedVersions = S.map (S.map (getItemFuture))
                                       (S.map (cPublishedVersionsParams (SKU_VERSIONS_TABLE)  
                                                                        (skuId (newImage))) 
                                              (versionsForComparison))
    // unwrapped :: Future Error [Object]
    const unwrapped = S.chain (S.sequence (Future)) (getPublishVersion)
    const generalDataNewVersion = S.prop ("generalData") (newImage)


    // compare versions that are published with the version that was uploaded
    const compareVersions = newVersion => getPublishedVersions => S.map
    (version => hash(S.props (["Item", "generalData"]) (version)) === hash(generalDataNewVersion)
      ? ({
        version: newVersion,
        skuId: S.props (["Item", "skuId", "S"]) (version),
        productId: S.props (["Item", "productId", "S"]) (version),
        dealerId: S.prop ("dealerId") 
        (S.fromMaybe ({}) 
          (S.head 
            (S.filter (v => S.props (["Item", "version", "N"]) (version) === S.prop ("version") (v))
              (versionsForComparison)))),
        allowedToAutoPublish: true,
        generalDataChanged: false,
      })
      : ({
        version: newVersion,
        publishedVersion: S.props (["Item", "version", "N"]) (version),
        skuId: S.props (["Item", "skuId", "S"]) (version),
        productId: S.props (["Item", "productId", "S"]) (version),
        dealerId: S.prop ("dealerId")
        (S.fromMaybe ({})
          (S.head 
            (S.filter (v => S.props (["Item", "version", "N"]) (version) === S.prop ("version") (v))
              (versionsForComparison)))),
        allowedToAutoPublish: false,
        generalDataChanged: true

      })) (getPublishedVersions)

    const comparedVersions = compareVersions (newVersion) (getPublishedVersions)
    const versionsOnlyForAutoPublishing = S.filter (S.prop ("allowedToAutoPublish")) (comparedVersions) 
    //log(versionsOnlyForAutoPublishing)

    // get SKUStatus for each version
    const getSKUStatus = await Promise.all ((S.unchecked.map (getItem) (S.map (cGetSKUStatusParams (SKU_TABLE)) (versionsOnlyForAutoPublishing)))) 


    const filterAndDepublish = autoPublish => status => 
      S.map (e => (S.filter (x => S.prop ("dealerId") (x) === S.props (["dealerId", "S"]) (e)) (autoPublish)).length > 0
        ? ({...S.prop ("M") (status), status: {"S": "Depublished"}})
        : S.prop ("M") (status)
      ) (status)

    const depublishSKUStatus = autoPublish => S.map (entry =>
      ({
        ...entry,
        Item: {
          ...S.prop ("Item") (entry),
          status: {"L": S.map (filterAndDepublish (autoPublish)) (S.props (["Item", "status", "L"]) (entry))}
        }
      })
    ) (getSKUStatus) 

    const depublishedVersions = depublishSKUStatus (versionsOnlyForAutoPublishing)
    const updatedSKUStatus = S.map (cUpdateSKUStatusParams () (SKU_TABLE)) (depublishedVersions)
    // save a new version of the SKU with status where all published are depublished (only for specific dealer)
    const saveNewSKUStatus = await Promise.all (S.unchecked.map (putItem) (updatedSKUStatus))

    const appendVersionToPublish = S.map (updateSKUStatusParams (SKU_TABLE)) (versionsOnlyForAutoPublishing)

    const appendPublishedVersion = await Promise.all (
      S.unchecked.map (updateItem) (appendVersionToPublish)
    )

    //adds a new item to the database with type: autopublish_v[i]_dealerId
    const autoPublishVersion = await  Promise.all(
      S.unchecked.map (putItem) (cAutoPublishingParams () (INSPECTIONS_TABLE) (versionsOnlyForAutoPublishing))
    )
      .catch(e => console.error(e) || callback(e))


    const versionsOnlyForVerification = S.reject (S.prop ("allowedToAutoPublish")) (comparedVersions)



    // adds a new item to the database with type: verifiction_v[i]_dealerId
    const createVerificationOrder = await Promise.all(
      S.unchecked.map (putItem) (cVerificationParams () (INSPECTIONS_TABLE) (versionsOnlyForVerification))
    )
      .catch(e => console.error(e) || callback(e))


    const listSnsParams = S.map (snsAutoPublishParams (SNS_XML_TOPIC)) (versionsOnlyForAutoPublishing)

    const sendSNSToXML = await Promise.all(
      S.unchecked.map (publishMsg) (listSnsParams)
    )
    return callback(null, "success")
  }

  return S.map (mapping) (parsedEvent)

}

module.exports.handler = handler
