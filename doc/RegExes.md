# Languasaurus
![CI Build](https://github.com/ghadeeras/languasaurus/workflows/ci-build/badge.svg?branch=master)

## Regular Expressions (RegExes)
Regular expressions represent the basic building blocks of scanners/parsers. They are analogous to "spelling" in human languages, as they define how the tokens of a language are made up of characters. In Languasaurus, you could use RegExes independently from their use in scanners and parsers. They provide some useful additional features that may not be found in RegExes of JavaScript, such as:

 * Creating regular expressions from automata.
 * Reusing regular expressions through composition.
 * Random generation of strings that match a regular expression.

### Defining RegExes
To follow are some basic examples on how to define regular expressions:

```typescript
import * as L from 'languasaurus'

const a = L.char('a')
const notA = L.charOtherThan('a')
const musicNote = L.charFrom('abcdefg')
const alsoMusicNote = L.charIn('a-g')
const notMusicNote = L.charNotFrom('abcdefg')
const alsoNotMusicNote = L.charNotIn('a-g')
const vibrato = L.word('vibrato') // a sequence of characters v, i, b, r, a, t, and o
```

Some composition examples:

```typescript
/* Include above examples. */

const alsoVibrato = L.concat(
    L.word('vib'),
    L.word('ra'),
    L.word('to')
)
const alphanumericChar = L.choice(
    L.charIn('0-9'),
    L.charIn('a-z'),
    L.charIn('A-Z')
)
const musicNotes = L.oneOrMore(musicNote) // or musicNote.repeated()
const musicOrSilence = L.zeroOrMore(musicNote)
const optionalMusicNotes = musicNotes.optional() // same as musicOrSilence
```

Some regular expressions cannot be represented easily in terms of above functions and operations, but can be specified using finite automata. An example on that is the C-style comment (i.e. /* ... */). To follow is how to use finite automata to define it:

```typescript
/* Specify states of the automaton. */
const start = L.state()
const enteringComment = L.state()
const insideComment = L.state()
const exitingComment = L.state()
const matchedComment = L.endState() // <-- Note that end states are declared differently as they recognize a matching string.

/* Specify the transitions between the states. */
start.onCharFrom('/', enteringComment)
enteringComment.onCharFrom('*', insideComment)
insideComment.onCharNotFrom('*', insideComment)
insideComment.onCharFrom('*', exitingComment)
exitingComment.onCharNotFrom('/', insideComment)
exitingComment.onCharFrom('/', matchedComment)

const cStyleComment = L.from(start)
```

### Using RegExes

To follow are examples on how to check that a string matches a pattern, or find a match in a string:

```typescript
import * as L from 'languasaurus'

const pascalCase = L.charIn('A-Z')
    .then(L.charIn('a-z').repeated())
    .repeated()

/* Truth functions */
console.log(pascalCase.matches("PascalCase")) // prints true
console.log(pascalCase.matches("snake_case")) // prints false

/* Functions returning indexes of characters just after a match is recognized. */
console.log(pascalCase.shortestMatch("PascalCase")) // prints 2
console.log(pascalCase.longestMatch("PascalCase")) // prints 9
console.log(pascalCase.longestMatch("snake_case or PascalCase")) // prints null
console.log(pascalCase.longestMatch("snake_case or PascalCase", 14)) // prints 23 (i.e. 14 + 9)
for (let index of pascalCase.matchIndexes("PascalCase")) {
    console.log(index) // prints 2, 3, 4, 5, 7, 8, 9
}

/* Functions returning ranges that point to a match in a string. */
console.log(pascalCase.find("this is AnExample of pascal case")) // prints [ 8, 17 ]
```
You could also use a regular expression to generate random strings that match the pattern represented by the RegEx:

```typescript
console.log(pascalCase.random())
```
