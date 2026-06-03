# Languasaurus
![CI Build](https://github.com/ghadeeras/languasaurus/workflows/ci-build/badge.svg?branch=master)

## The Scanner / Lexical Analyzer
The next level up in language construction is to build a scanner, or a lexical analyzer. This would take a stream of characters as input and spit out a stream of tokens or lexemes as output. Each type of token is associated with a regular expression that recognizes instances of the token type. The scanner basically tries to consume the longest string of characters that matches the regular expression of a token type, outputs it, then tries to consume the next token. If it encounters a string of characters it could not recognize, it produces an error token. Finally, if it reaches the end of the character stream, it outputs an EOF (end of file) token.

### Defining the Scanner
To follow is an example of how to build or define a scanner:

```typescript
import * as s from "languasaurus"

// Reusable regular expressions.
const lowerCaseChar = s.charIn("a-z")
const upperCaseChar = s.charIn("A-Z")
const alphaChar = s.choice(lowerCaseChar, upperCaseChar)
const numericChar = s.charIn("0-9")
const alphaNumericChar = s.choice(alphaChar, numericChar)

const defs = {

    whiteSpace: s.string(s.oneOrMore(s.charFrom(" \t\r\n"))),

    identifier: s.string(s.concat(
        alphaChar,
        s.zeroOrMore(alphaNumericChar)
    )),

    literalNumber: s.float(s.concat(
        s.zeroOrMore(numericChar),
        s.char("."),
        s.oneOrMore(numericChar)
    )),

    // Operators
    opPlus: s.op("+"),
    opMinus: s.op("-"),
    opMul: s.op("*"),
    opDiv: s.op("/"),
    opPow: s.op("^"),

    // Delimiters
    delOpenParen: s.delimeter("("),
    delCloseParen: s.delimeter(")"),

}
const myScanner = new s.Scanner(defs)
```

### Using the Scanner
Lets continue the example above and add the following code:

```typescript
const expression = "amplitude * sin(2.0 * pi * frequency * time + phase) + bias"
const stream = new s.TextInputStream(expression)
for (let token of myScanner.iterator(stream)) {
    const tokenTypeName = myScanner.tokenTypeName(token.tokenType)
    console.log(
        `Token '${token.lexeme}' of type '${tokenTypeName}' at [Line: ${token.position.line}, Column: ${token.position.column}]`
    )
}
```

In the code above, after creating a scanner, we use its `iterator()` method to iterate over the tokens in a stream of characters. For each token, we print the lexeme (the actual sub-string that matches a token type regular expression), the token type, and the position it was found at.

The output would look like this:

```
Token 'amplitude' of type 'identifier' at [Line: 1, Column: 1]
Token ' ' of type 'whiteSpace' at [Line: 1, Column: 10]     
Token '*' of type 'opMul' at [Line: 1, Column: 11]
Token ' ' of type 'whiteSpace' at [Line: 1, Column: 12]     
Token 'sin' of type 'identifier' at [Line: 1, Column: 13]   
Token '(' of type 'delOpenParen' at [Line: 1, Column: 16]   
Token '2.0' of type 'literalNumber' at [Line: 1, Column: 17]
Token ' ' of type 'whiteSpace' at [Line: 1, Column: 20]     
Token '*' of type 'opMul' at [Line: 1, Column: 21]
Token ' ' of type 'whiteSpace' at [Line: 1, Column: 22]     
Token 'pi' of type 'identifier' at [Line: 1, Column: 23]
Token ' ' of type 'whiteSpace' at [Line: 1, Column: 25]
Token '*' of type 'opMul' at [Line: 1, Column: 26]
Token ' ' of type 'whiteSpace' at [Line: 1, Column: 27]
Token 'frequency' of type 'identifier' at [Line: 1, Column: 28]
Token ' ' of type 'whiteSpace' at [Line: 1, Column: 37]
Token '*' of type 'opMul' at [Line: 1, Column: 38]
Token ' ' of type 'whiteSpace' at [Line: 1, Column: 39]
Token 'time' of type 'identifier' at [Line: 1, Column: 40]
Token ' ' of type 'whiteSpace' at [Line: 1, Column: 44]
Token '+' of type 'opPlus' at [Line: 1, Column: 45]
Token ' ' of type 'whiteSpace' at [Line: 1, Column: 46]
Token 'phase' of type 'identifier' at [Line: 1, Column: 47]
Token ')' of type 'delCloseParen' at [Line: 1, Column: 52]
Token ' ' of type 'whiteSpace' at [Line: 1, Column: 53]
Token '+' of type 'opPlus' at [Line: 1, Column: 54]
Token ' ' of type 'whiteSpace' at [Line: 1, Column: 55]
Token 'bias' of type 'identifier' at [Line: 1, Column: 56]
Token '' of type 'EOF' at [Line: 1, Column: 60]
```
