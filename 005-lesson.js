const {create, env} = require("sanctuary")
const $ = require("sanctuary-def")
const fs = require("fs")
const { Future } = require("fluture") 
const {view, set, lensProp, over} = require("ramda")
const fst = require("fluture-sanctuary-types")

const S = create({
  checkTypes: true,
  env: env.concat (fst.env)
})

const Location = $.RecordType ({city: $.String})

// type constructor is $.Array (Location)
// User :: Type 
const User = $.RecordType 
({
  name: $.String, 
  age: $.NonNegativeInteger, 
  location: ($.Array (Location))
})

//    readFile :: String -> Future Error String
const readFile = fileName =>
  Future((rej, res) => fs.readFile(fileName, "utf-8", (err, data) => err ? rej(err) : res(data)))

const file = fs.readFileSync("./test.json", "utf-8")

//    maybeToFuture :: a -> Maybe b -> Future a b
const maybeToFuture = error => 
  S.maybe (Future.reject(error)) (Future.of) 

// parsedFile :: Maybe User
const parsedFile = S.parseJson (S.is (User)) (file)

const pipe = S.pipe([
                readFile,
                S.map (S.parseJson (S.is (User))),
                S.chain (maybeToFuture (new Error("Json not parsed"))),
                S.map (over(lensProp ("age"), S.add (1))),
                
])

pipe("./test.json").fork(console.error, console.log)
