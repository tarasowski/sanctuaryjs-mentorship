const AWS = require("aws-sdk")
const S = require("./sanctuary.js")
const {Future} = require("fluture")
const {
  putItem,
  getItemFuture,
  putItemFuture,
  updateItemFuture,
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
  cVerificationParams_
} = require("./utils/dynamodb.js")

const {
  publishMsg,
  snsAutoPublishParams,
} = require("./utils/sns.js")

const hash = require("object-hash")
const log = x => console.log(JSON.stringify(x, null, 2)) || x
const asyncPipe = fns => x => fns.reduce(async (v, f) => f (await v), x)

const NODE_ENV = process.env.NODE_ENV || "dev"
const SKU_TABLE = process.env.SKU_TABLE || `FDHSKUs-${NODE_ENV}`
const SKU_VERSIONS_TABLE = process.env.SKU_VERSIONS_TABLE || `FDHSKUVersions-${NODE_ENV}`
const INSPECTIONS_TABLE = process.env.INSPECTIONS_TABLE || `FDHInspections-${NODE_ENV}`
const PRODUCERS_TABLE = process.env.PRODUCERS_TABLE || `FDHProducers-${NODE_ENV}`
const SNS_XML_TOPIC = process.env.XML_TOPIC || "arn:aws:sns:eu-central-1:306098392847:BuildXML"

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

const checkForAutoPublish = S.pipe ([
    S.filter (S.props (["M", "autoPublish", "BOOL"])),
    S.map (S.props (["M", "dealerId", "S"]))
  ]) 

const getDealers = S.pipe([
  cProducerParams (PRODUCERS_TABLE),
  getItemFuture,
  S.map (S.props (["Item", "dealers", "L"])),
]) 

const autoPublishedVersions = event => dealerList => S.pipe([
  cParamsSKU (SKU_TABLE),
  getItemFuture,
  S.map (S.props (["Item", "status", "L"])),
  S.map (S.filter (status => S.props (["M", "status", "S"]) (status) === "Published")),
  S.map (S.map (status => ({dealerId: S.props (["M", "dealerId", "S"]) (status), version: S.props (["M", "version", "N"]) (status)}))),
  S.map (S.filter (entry => dealerList.includes(entry.dealerId))), 
]) (event)

const fullPublishedVersions = parsedEvent => S.pipe([
  S.map (cPublishedVersionsParams (SKU_VERSIONS_TABLE) (parsedEvent.skuId.S)),
  S.traverse (Future) (getItemFuture)
  ]) 

//    {version, skuId, productId, dealerId, allowedToAutoPublish, generalDataChanged} :: MetaItem
//    compareGeneralData :: [MetaItem]
const  compareGeneralData = parsedEvent => versionsByDealers => getPublishedVersions => 
  S.map
    (version => hash(version.Item.generalData) === hash(parsedEvent.generalData)
      ? ({
        version: parsedEvent.version.N,
        publishedVersion: version.Item.version.N,
        skuId: version.Item.skuId.S, 
        productId: version.Item.productId.S,
        dealerId: S.pipe([
          S.filter (v => version.Item.version.N === v.version),
          S.head,
          S.fromMaybe ({}),
          S.prop ("dealerId")
        ]) (versionsByDealers),
        allowedToAutoPublish: true,
        generalDataChanged: false,
      })
      : ({
        version: parsedEvent.version.N,
        publishedVersion: version.Item.version.N,
        skuId: version.Item.skuId.S, 
        productId: version.Item.productId.S,
        dealerId: S.pipe([
          S.filter (v => version.Item.version.N === v.version),
          S.head,
          S.fromMaybe ({}),
          S.prop ("dealerId")
        ]) (versionsByDealers),
        allowedToAutoPublish: true,
        generalDataChanged: true

      }))
    (getPublishedVersions)

  const filterAndDepublish = autoPublish => status => 
    S.map (e => (S.filter (x => x.dealerId === e.dealerId.S) (autoPublish)).length > 0
    ? ({...S.prop ("M") (status), status: {"S": "Depublished"}})
    : S.prop ("M") (status)
    ) (status)

  const depublishSKUStatus = autoPublish => 
    S.map (entry =>
    ({
      ...entry,
      Item: {
        ...entry.Item,
        status: {
          "L": S.map (filterAndDepublish (autoPublish)) (entry.Item.status.L)
        }
      }
    })
  ) 

const program = timestamp => S.pipe([
  S.prop ("Records"),
  S.head,
  S.filter (e => S.prop ("eventName") (e) === "INSERT"), // can be applied to Maybe
  S.maybe (Future.reject("No insert records")) (Future.of),
  S.map (S.props (["dynamodb", "NewImage"])),
  S.chain (event => {
    const newVersion = event.version.N
    const dealers = getDealers (event)
    const autoPublishDealers = S.map (checkForAutoPublish) (dealers) 
    const versionsByDealers = S.chain (autoPublishedVersions (event)) (autoPublishDealers)
    const getPublishedVersions = S.chain (fullPublishedVersions (event)) (versionsByDealers)
    const comparedVersions = S.join (S.lift2 (compareGeneralData (event)) (versionsByDealers) (getPublishedVersions))
    const versionsForAutoPublish = S.map (S.filter (S.prop ("allowedToAutoPublish"))) (comparedVersions) 
    const versionsForVerification = S.map (S.filter (S.prop ("generalDataChanged"))) (comparedVersions)
    const depublishVersions = S.chain (S.pipe([
      S.map (cGetSKUStatusParams (SKU_TABLE)),
      S.traverse (Future) (getItemFuture),
      S.lift2 (depublishSKUStatus) (versionsForAutoPublish),
      S.map (cUpdateSKUStatusParams (timestamp) (SKU_TABLE)),
      S.traverse (Future) (putItemFuture),
    ])) (versionsForAutoPublish)

    const updateSKUStatusList = S.chain (S.pipe([
      S.map (updateSKUStatusParams (SKU_TABLE)),
      S.traverse (Future) (updateItemFuture),
    ])) (versionsForAutoPublish)

  const addAutoPublishLog = S.chain (S.pipe([
    S.map (cAutoPublishingParams (timestamp) (INSPECTIONS_TABLE)),
    S.traverse (Future) (putItemFuture),
  ])) (versionsForAutoPublish)

  const addVerificationLog = S.chain (S.pipe([
    S.map (cVerificationParams (timestamp) (INSPECTIONS_TABLE)),
    S.traverse (Future) (putItemFuture),
  ])) (versionsForVerification)

    return S.join (S.lift3 (dealers => publish => verification =>
                    (publish.length === 0 && verification.length === 0 ? S.pipe([
                        S.map (cVerificationParams_ (timestamp) (INSPECTIONS_TABLE) (event)),
                        S.traverse (Future) (putItemFuture),
                    ]) (dealers) : Future.of({}))
            )
            (dealers)
            (versionsForAutoPublish) 
            (versionsForVerification)
    )

  })
])

//    main :: OI String
const main = async event => {
  return program (Date.now()) (event).fork(_ => "error",_ => "success")
  
module.exports = {main, program}
