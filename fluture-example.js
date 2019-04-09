const { Future } = require("fluture")
const S = require("sanctuary")

const queryResult = Future.of(
  S.Just ( [ "hello", "world"] )
)

const validateGreet = xs =>
  xs.includes("HELLO")
    ? S.Right (xs)
    : S.Left ("Invalid Greeting!")

const transform = S.pipe([
  S.map (S.pipe( [ S.trim, S.toUpper ] ) ),
  validateGreet
])

const execture =
  queryResult
  .map( S.map (transform) )
  .fork(
    err => (console.log(err), process.exit(1)),
    res => {
      const maybeResult = S.fromMaybe ( S.Right ([]) ) (res)
      S.either (console.error) (console.log) (maybeResult)
    })
