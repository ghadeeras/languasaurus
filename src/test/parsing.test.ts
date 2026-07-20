import * as p from "../prod/parsing.js"
import * as gram from "../prod/grammar.js"
import * as lex from "../prod/tokens.js"
import * as rex from "../prod/regex.js"
import * as stream from "../prod/streams.js"

describe("parsing", () => {

    it.skip("works", () => {
        const tokens = {
            booleanLit: lex.boolean(),
            intLit: lex.integer(rex.oneOrMore(rex.charIn("0-9"))),
            floatLit: lex.float(rex.concat(
                rex.zeroOrMore(rex.charIn("0-9")), 
                rex.char("."), 
                rex.oneOrMore(rex.charIn("0-9"))
            )),
            identifier: lex.string(rex.oneOrMore(rex.concat(
                rex.choice(
                    rex.charIn("A-Z")
                ),
                rex.oneOrMore(rex.choice(
                    rex.charIn("a-z")
                ))
            ))),
            parenOpen: lex.string(rex.word("(")),
            parenClose: lex.string(rex.word(")")),
            opFactor: lex.string(rex.charFrom("*/")),
            opAdd: lex.string(rex.charFrom("+-")),
            whiteSpace: lex.string(rex.oneOrMore(rex.charFrom(" \t\n\r"))),
        }

        type Exp = { left: { op: string | null, value: Factor }, right: { op: string, value: Factor }[] }
        type Factor = { left: Term, right: { op: string, value: Term }[] }
        type Term = gram.Case<"lit", number> | gram.Case<"fun", FunCall> | gram.Case<"parenthesized", Param>
        type FunCall = { funName: string, param: Param | null }
        type Param = { parenOpen: string, arg: Exp, parenClose: string }

        const TRM = gram.terminals(tokens)
        const exp: gram.Repeatable<Exp> = gram.production(() => ({
            left: gram.production({
                op: TRM.opAdd.tokenless().optional(),
                value: factor
            }),
            right: gram.production({
                op: TRM.opAdd.tokenless(),
                value: factor
            }).zeroOrMore() 
        }))
        const param = gram.production({
            parenOpen: TRM.parenOpen.tokenless(),
            arg: exp,
            parenClose: TRM.parenClose.tokenless()
        })
        const funCall = gram.production({
            funName: TRM.identifier.tokenless(),
            param: param.optional()
        })
        const term = gram.choice({
            lit: TRM.floatLit.tokenless(),
            fun: funCall,
            parenthesized: param
        })
        const factor = gram.production({
            left: term,
            right: gram.production({
                op: TRM.opFactor.tokenless(),
                value: term
            }).zeroOrMore()
        })
        const symbols =  { exp, funCall, term, factor, param }

        const parser = p.recursiveDescentParser(tokens, symbols.exp)

        const tree = parser(new stream.TextInputStream("Pascal + Sin(Pi / 3.0) + meow"));
        console.log(JSON.stringify(tree, null, 2))
        console.log(...[...symbols.exp.tokens(tree)].map(t => t.lexeme));

    })

})
