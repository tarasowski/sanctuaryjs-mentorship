'use strict';

const Future = require ('fluture');
const S = require ('sanctuary');

//    data Action = Reset | Increment Integer | Decrement Integer

//    Reset :: Action
const Reset = {tagName: 'Reset'};

//    Increment :: Integer -> Action
const Increment = n => ({tagName: 'Increment', value: n});

//    Decrement :: Integer -> Action
const Decrement = n => ({tagName: 'Decrement', value: n});

//    match :: { Reset :: a, Increment :: Integer -> a, Decrement :: Integer -> a } -> Action -> a
const match = cases => action => {
  switch (action.tagName) {
    case 'Reset':
      return cases.Reset;
    case 'Increment':
      return cases.Increment (action.value);
    case 'Decrement':
      return cases.Decrement (action.value);
  }
};

//    showAction :: Action -> String
const showAction = match ({
  Reset: 'Reset',
  Increment: n => 'Increment (' + n + ')',
  Decrement: n => 'Decrement (' + n + ')',
});

//    showState :: State -> String
const showState = String;

//    initialState :: State
const initialState = 0;

//    update :: Action -> State -> Pair State (Future a String)
const update = action => state => match ({
  Reset:          S.Pair (0)         (Future ((rej, res) => { res (`UPDATE table SET num = ${showState (0)}`);         return () => {}; })),
  Increment: n => S.Pair (state + n) (Future ((rej, res) => { res (`UPDATE table SET num = ${showState (state + n)}`); return () => {}; })),
  Decrement: n => S.Pair (state - n) (Future ((rej, res) => { res (`UPDATE table SET num = ${showState (state - n)}`); return () => {}; })),
}) (action);

let state = initialState;

//    impureUpdate :: Action -> State
const impureUpdate = action => {
  const [newState, future] = update (action) (state);
  state = newState;
  Future.fork (console.error) (console.log) (future);
};

impureUpdate (Increment (1));
console.log (showState (state));

impureUpdate (Increment (10));
console.log (showState (state));
