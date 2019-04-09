const S = require("sanctuary")
const AWS = require("aws-sdk")
const s3 = new AWS.S3({region: "eu-central-1"})

const asyncPipe = (fns) => x => fns.reduce(async (v, f) => f(await v), x)

const constrImpFileParams = ({bucketName, folderName, key}) =>
  ({
    Bucket: bucketName,
    Key: S.concat (S.concat (folderName) ('/')) (key)
  })

const getObject = params =>
  s3.getObject(params).promise()


const getProps = x => {
  const bucketName = S.props (["s3", "bucket", "name"]) (x)
  const key = S.props (["s3", "object", "key"]) (x)
  const components = S.splitOn ('/') (key)
  const head = S.head (components)
  const tail = S.tail (components)
  const nonEmptyTail = S.reject (S.equals ([])) (tail)
  const obj = head => tail => ({bucketName, folderName: head, key: S.joinWith ('/')  (tail) })
  const params = S.lift2 (obj) (head) (nonEmptyTail)
  return params

}

const parseEvent = S.pipe([
    S.prop ("Records"),
    S.head,
    S.chain (getProps),
    ]) 

const handler = async event =>
  asyncPipe([
    parseEvent,
    //constrImpFileParams,
    //getObject,
  ]) (event)

module.exports.handler = handler 

