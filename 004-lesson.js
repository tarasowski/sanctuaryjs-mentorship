//  map   :: Functor f => (a -> b) -> f a -> f b
//
//  ap    :: Apply f => f (a -> b) -> f a -> f b
//
//  chain :: Chain f => (a -> f b) -> f a -> f b
//
//
//  [Math.abs, x => x + 1]
//
//  [1, 2, 3]
//
//  [Math.abs (1), Math.abs (2), Math.abs (3), 1 + 1, 2 + 1, 3 + 1]
//
//
//  ap :: Maybe (a -> b) -> Maybe a -> Maybe b
//
//  S.ap (S.Just (Math.sqrt)) (S.Just (64))  // => Just (8)

//    asdf :: Number -> String -> Boolean
const asdf = x => y => ???;

//    n :: Maybe Number
const n = ???;

//    s :: Maybe String
const s = ???;

//  map :: (Number -> (String -> Boolean)) -> Maybe Number -> Maybe (String -> Boolean)

S.map (asdf) (n)  // :: Maybe (String -> Boolean)

//  ap :: Maybe (String -> Boolean) -> Maybe String -> Maybe Boolean

S.ap (S.map (asdf) (n)) (s)
//           ^^^^   ^    ^
//                  1    2

S.ap (S.ap (S.map (f) (x)) (y)) (z)

lift = map
lift2 = map + ap
lift3 = map + ap + ap
lift4 = map + ap + ap + ap

//  ---

S.pipe ([
  asdf,
  a;sdlkfj;lkj,
  a;sdlfkja;slkdfj,
  xs => {
    const head = S.head (xs);
    const tail = S.tail (xs);
    return S.pipe ([
      asdf,
      as;dlkfj;a,
      x => f (x) (tail),
      asdf;lkj;,
      asdf,
    ]) (head);
  },
  asdlfkj;asldf,
  asdf;lkajsdf;l,
])

//  ---

a > b

(>) a b

(> 0) 3  // this is known as “sectioning” in Haskell

3 > 0

("prefix" ++)

(++ "suffix")

//  This shows why S.lt takes its arguments “backwards”:
S.reject (S.lt (0)) ([1, -2, 3, -4, 5])  // => [1, 3, 5]

//  ---

//  Array#map provides index as second argument:
['foo', 'bar', 'baz'].map ((s, idx) => String (idx) + ':' + s)

//  Manually tracking array index using S.reduce:
S.snd (S.reduce (([idx, array]) => s =>
                   S.Pair (idx + 1)
                          (S.append (String (idx) + ':' + s) (array)))
                (S.Pair (0) ([]))
                (['foo', 'bar', 'baz']))
