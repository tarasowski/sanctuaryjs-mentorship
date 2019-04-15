'use strict';

const {create, env} = require ('sanctuary');
const $ = require ('sanctuary-def');
const type = require ('sanctuary-type-identifiers');


//    GraphType :: Type -> Type
const GraphType = $.UnaryType
  ('Graph')
  ('')
  (x => type (x) === 'my-package/Graph@1')
  (graph => [graph.value]);

const S = create ({
  checkTypes: true,
  env: env.concat ([GraphType ($.Unknown)]),
});

//  A--B--C
//  |  |  |
//  D--E--F
//  |  |  |
//  G--H--I
//
//        A
//       / \
//      /   \
//     D     B
//    / \   / \
//   /   \ /   \
//  G     E     C
//   \   / \   /
//    \ /   \ /
//     H     F
//      \   /
//       \ /
//        I

//    Graph :: a -> Maybe (Graph a) -> Maybe (Graph a) -> Graph a
const Graph = value => left => right => ({
  constructor: {'@@type': 'my-package/Graph@1'},
  '@@show': () => 'Graph (' + S.show (value) + ')' +
                       ' (' + S.show (left) + ')' +
                       ' (' + S.show (right) + ')',
  'fantasy-land/map': f => Graph (f (value))
                                 (S.map (S.map (f)) (left))
                                 (S.map (S.map (f)) (right)),
  value: value,
  left: left,
  right: right,
});

const I = Graph ('I') (S.Nothing) (S.Nothing);
const H = Graph ('H') (S.Nothing) (S.Just (I));
const F = Graph ('F') (S.Just (I)) (S.Nothing);
const G = Graph ('G') (S.Nothing) (S.Just (H));
const E = Graph ('E') (S.Just (H)) (S.Just (F));
const C = Graph ('C') (S.Just (F)) (S.Nothing);
const D = Graph ('D') (S.Just (G)) (S.Just (E));
const B = Graph ('B') (S.Just (E)) (S.Just (C));
const A = Graph ('A') (S.Just (D)) (S.Just (B));

console.log (S.show (E));
console.log (S.show (S.map (S.toLower) (E)));
