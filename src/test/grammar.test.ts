import * as rex from "../prod/regex.js";
import * as tokens from "../prod/tokens.js";
import * as gram from "../prod/grammar.js";
import { expect } from 'chai'

const booleanLit = gram.terminal(tokens.boolean()).tokenless()
const intLit = gram.terminal(tokens.integer(rex.oneOrMore(rex.charIn("0-9")))).tokenless()
const floatLit = gram.terminal(tokens.float(rex.concat(
    rex.zeroOrMore(rex.charIn("0-9")), 
    rex.char("."), 
    rex.oneOrMore(rex.charIn("0-9"))
))).tokenless()
const idToken = gram.terminal(tokens.string(rex.oneOrMore(rex.concat(
    rex.choice(
        rex.charIn("A-Z")
    ),
    rex.oneOrMore(rex.choice(
        rex.charIn("a-z")
    ))
))));
const identifier = idToken.tokenless()
const parenOpen = gram.terminal(tokens.string(rex.word("("))).tokenless()
const parenClose = gram.terminal(tokens.string(rex.word(")"))).tokenless()
const opFactor = gram.terminal(tokens.string(rex.charFrom("*/"))).tokenless()
const opAdd = gram.terminal(tokens.string(rex.charFrom("+-"))).tokenless()

describe("Grammar", () => {

    describe("symbol sets", () => {

        it("collects symbols wrapped in optionals", () => {
            const optionalId = identifier.optional();
            const g = new gram.Grammar(optionalId)

            expect(g).to.satisfy(containmentOf(optionalId))
            expect(g).to.satisfy(containmentOf(identifier))
        })

        it("collects symbols wrapped in zero-or-more repetitions", () => {
            const zeroOrMorelId = identifier.zeroOrMore();
            const g = new gram.Grammar(zeroOrMorelId)

            expect(g).to.satisfy(containmentOf(zeroOrMorelId))
            expect(g).to.satisfy(containmentOf(identifier))
        })

        it("collects symbols wrapped in one-or-more repetitions", () => {
            const oneOrMorelId = identifier.oneOrMore();
            const g = new gram.Grammar(oneOrMorelId)

            expect(g).to.satisfy(containmentOf(oneOrMorelId))
            expect(g).to.satisfy(containmentOf(identifier))
        })

        it("collects symbols wrapped in productions", () => {
            const production = gram.production({opCode: identifier, op1: identifier, op2: intLit});
            const g = new gram.Grammar(production)

            expect(g).to.satisfy(containmentOf(production))
            expect(g).to.satisfy(containmentOf(identifier))
            expect(g).to.satisfy(containmentOf(intLit))
        })

        it("collects symbols wrapped in choices", () => {
            const varExp = gram.production({id: identifier});
            const numExp = gram.production({val: intLit});
            const exp = gram.choice(varExp.as("v"), numExp.as("n"))
            const g = new gram.Grammar(exp)

            expect(g).to.satisfy(containmentOf(exp))
            expect(g).to.satisfy(containmentOf(varExp))
            expect(g).to.satisfy(containmentOf(numExp))
            expect(g).to.satisfy(containmentOf(identifier))
            expect(g).to.satisfy(containmentOf(intLit))
        })

        function containmentOf<T>(symbol: gram.Symbol<any>): (g: gram.Grammar<T>) => boolean {
            return g => g.symbols.has(symbol) 
                && g.isOptional(symbol) !== undefined 
                && g.firstSetOf(symbol) !== undefined 
                && g.followSetOf(symbol) !== undefined
        }

    })

    describe("optionality", () => {

        it("determines terminals to be non-optional", () => {
            const g = new gram.Grammar(identifier)

            expect(g.isOptional(identifier)).to.be.false
        })

        it("determines optionals to be, well, optional", () => {
            const optionalId = identifier.optional();
            const g = new gram.Grammar(optionalId)

            expect(g.isOptional(optionalId)).to.be.true
            expect(g.isOptional(identifier)).to.be.false
        })

        it("determines zero-or-more repetition to be optional", () => {
            const zeroOrMorelId = identifier.zeroOrMore();
            const g = new gram.Grammar(zeroOrMorelId)

            expect(g.isOptional(zeroOrMorelId)).to.be.true
            expect(g.isOptional(identifier)).to.be.false
        })

        it("determines one-or-more repetition to follow optionality of wrapped symbol", () => {
            const zeroOrMorelId = identifier.zeroOrMore();
            const oneOrMorelId = identifier.oneOrMore();
            const idsArray = gram.production({array: zeroOrMorelId}).oneOrMore()
            const g1 = new gram.Grammar(oneOrMorelId)
            const g2 = new gram.Grammar(idsArray)

            expect(g1.isOptional(oneOrMorelId)).to.be.false
            expect(g2.isOptional(idsArray)).to.be.true
        })

        it("determines productions to be optional if all its symbols are optional", () => {
            const tuple = gram.production({left: identifier.optional(), right: identifier.optional()})
            const g = new gram.Grammar(tuple)

            expect(g.isOptional(tuple)).to.be.true
        })

        it("determines productions to be non-optional if any of its symbols is non-optional", () => {
            const tuple1 = gram.production({left: identifier, right: identifier.optional()}).as("1")
            const tuple2 = gram.production({left: identifier.optional(), right: identifier}).as("2")
            const tuple3 = gram.production({left: identifier, right: identifier}).as("3")
            const g = new gram.Grammar(gram.choice(tuple1, tuple2, tuple3))

            expect(g.isOptional(tuple1)).to.be.false
            expect(g.isOptional(tuple2)).to.be.false
            expect(g.isOptional(tuple3)).to.be.false
        })

        it("determines choices to be optional if any of its productions is optional", () => {
            const choice1 = gram.choice(gram.production( {id: identifier}).as("id"), gram.production({val: intLit.optional()}).as("int"))
            const choice2 = gram.choice(gram.production( {id: identifier.optional()}).as("id"), gram.production({val: intLit}).as("int"))
            const choice3 = gram.choice(gram.production( {id: identifier.optional()}).as("id"), gram.production({val: intLit.optional()}).as("int"))
            const g = new gram.Grammar(gram.production( {c1: choice1, c2: choice2, c3: choice3}))

            expect(g.isOptional(choice1)).to.be.true
            expect(g.isOptional(choice2)).to.be.true
            expect(g.isOptional(choice3)).to.be.true
        })

        it("determines choices to be non-optional if all its symbols are non-optional", () => {
            const choice = gram.choice(gram.production({id: identifier}).as("id"), gram.production({val: intLit}).as("int"))
            const g = new gram.Grammar(choice)

            expect(g.isOptional(choice)).to.be.false
        })

        it("works correctly even for indirectly recursive rules", () => {
            const recursive = gram.recursively(self => {
                const subR = gram.choice(intLit.as("num"), self.as("rec"))
                const r = gram.choice(gram.production({ id: identifier.optional() }).as("id"), subR.as("subR"))
                return [r, { r, subR }]
            })

            const g = new gram.Grammar(recursive.r)

            expect(g.isOptional(recursive.subR)).to.be.true
        })

    })

    describe("first set", () => {

        it("has the wrapped token type, for a terminal", () => {
            const g = new gram.Grammar(identifier)

            expect(g.firstSetOf(identifier)?.size).to.equal(1)
            expect(g.firstSetOf(identifier)).to.contain(idToken.tokenType)
        })

        it("is the first set of wrapped symbol, for an optional", () => {
            const optional = identifier.optional();
            const g = new gram.Grammar(optional)

            expect(g.firstSetOf(optional)).satisfies(aSetEqualTo(g.firstSetOf(identifier)))
        })

        it("is the first set of wrapped symbol, for a zero-or-more", () => {
            const zeroOrMore = identifier.zeroOrMore();
            const g = new gram.Grammar(zeroOrMore)

            expect(g.firstSetOf(zeroOrMore)).satisfies(aSetEqualTo(g.firstSetOf(identifier)))
        })

        it("is the first set of wrapped symbol, for a one-or-more", () => {
            const oneOrMore = identifier.oneOrMore();
            const g = new gram.Grammar(oneOrMore)

            expect(g.firstSetOf(oneOrMore)).satisfies(aSetEqualTo(g.firstSetOf(identifier)))
        })

        it("is the union of first sets of wrapped symbols, for a choice", () => {
            const choice = gram.choice(
                gram.production({ name: identifier }).as("id"),
                gram.production({ value: intLit }).as("int")
            );
            const g = new gram.Grammar(choice)

            expect(g.firstSetOf(choice)).satisfies(aSetEqualTo(new Set([
                ...g.firstSetOf(identifier),
                ...g.firstSetOf(intLit),
            ])))
        })

        it("is the union of first sets of the leading optional symbols and the first non-optional symbol, for a production", () => {
            const prod1 = gram.production({ 
                a: identifier.optional(), 
                b: intLit, 
                c: booleanLit.optional(), 
                d: floatLit 
            });
            const prod2 = gram.production({
                half1: gram.production({
                    a: identifier.optional(), 
                    b: intLit, 
                }),
                c: booleanLit.optional(), 
                d: floatLit 
            });
            
            const g1 = new gram.Grammar(prod1)
            const g2 = new gram.Grammar(prod2)

            expect(g1.firstSetOf(prod1)).satisfies(aSetEqualTo(new Set([
                ...g1.firstSetOf(identifier),
                ...g1.firstSetOf(intLit),
            ])))
            expect(g2.firstSetOf(prod2)).satisfies(aSetEqualTo(new Set([
                ...g2.firstSetOf(identifier),
                ...g2.firstSetOf(intLit),
            ])))
        })

        it("works correctly even for indirectly recursive rules", () => {
            type R = 
                  { type: "id", value: string } 
                | { type: "subR", value: 
                      { type: "num", value: number } 
                    | { type: "rec", value: R } 
                  }

            const recursive = gram.recursively((self: gram.Repeatable<R>) => {
                const subR = gram.choice(intLit.as("num"), self.as("rec"))
                const r = gram.choice(identifier.as("id"), subR.as("subR"))
                return [r, { r, subR }]
            })

            const g = new gram.Grammar(recursive.r)

            expect(g.firstSetOf(recursive.subR)).satisfies(aSetEqualTo(new Set([
                ...g.firstSetOf(intLit),
                ...g.firstSetOf(identifier),
            ])))
        })

    })

    describe("follow set", () => {

        function grammar<T, N>(symbol: gram.Symbol<T>, next: gram.Symbol<N>) {
            return new gram.Grammar(gram.production({ symbol, next }))
        }

        const begin = gram.terminal(tokens.keyword("begin")).tokenless()
        const end = gram.terminal(tokens.keyword("end")).tokenless()

        function wrap<T>(symbol: gram.Symbol<T>): gram.Grammar<{ begin: "begin", impl: T, end: "end" }> {
            return new gram.Grammar((gram.production({
                begin,
                impl: symbol,
                end
            })))
        }

        it("is EOF for start symbols", () => {
            const g = wrap(gram.choice(intLit.as("int"), floatLit.as("float"), identifier.as("id")))
            expect(g.followSetOf(g.start)).satisfies(aSetEqualTo(new Set([tokens.eof])))
        })
    
        it("propagates from parent contexts for symbols followed by optional or empty symbols", () => {
            const p = gram.production({ bool: booleanLit, int: intLit.zeroOrMore(), float: floatLit, id: identifier.optional() });
            const g = wrap(p)
            expect(g.followSetOf(p.definition.id)).satisfies(aSetEqualTo(g.followSetOf(p)))
            expect(g.followSetOf(p.definition.float)).satisfies(aSetEqualTo(new Set([...g.firstSetOf(p.definition.id), ...g.followSetOf(p.definition.id)])))
            expect(g.followSetOf(p.definition.bool)).satisfies(aSetEqualTo(new Set([...g.firstSetOf(p.definition.int), ...g.firstSetOf(p.definition.float)])))
        })

        it("does not propagate from parent contexts for symbols followed by non optional symbols", () => {
            const p = gram
                .productionOf("int", intLit)
                .then("float", floatLit.oneOrMore())
                .then("id", identifier);
            const g = wrap(p)
            expect(g.followSetOf(p.definition.float)).satisfies(aSetEqualTo(g.firstSetOf(p.definition.id)))
            expect(g.followSetOf(p.definition.int)).satisfies(aSetEqualTo(g.firstSetOf(p.definition.float)))
        })

        it("propagates to all productions in a choice", () => {
            const c = gram
                .choiceOf("int", intLit)
                .or("float", floatLit)
                .or("id", identifier);
            const g = wrap(c)
            expect(g.followSetOf(intLit)).satisfies(aSetEqualTo(g.followSetOf(c)))
            expect(g.followSetOf(floatLit)).satisfies(aSetEqualTo(g.followSetOf(c)))
            expect(g.followSetOf(identifier)).satisfies(aSetEqualTo(g.followSetOf(c)))
        })
    
    })

    describe("random", () => {

        const productions = gram.recursively(self => {
            const funCall = gram.production({
                funName: identifier.optional(),
                parenOpen,
                arg: self,
                parenClose
            }).mapped(
                ({funName, arg}) => funName !== null ? ({ funName, arg}) : arg,
                n => 
                      "funName" in n && "arg" in n ? ({ parenOpen: "(", parenClose: ")", ...n }) 
                    : ({ funName: null, parenOpen: "(", arg: n, parenClose: ")"})
            )
            const term = gram.choice(
                floatLit.as("lit"),
                identifier.as("id"),
                funCall.as("fun")
            ).mapped(
                n => n.value, 
                n => 
                      typeof n == "number" ? ({type: "lit", value: n})
                    : typeof n == "string" ? ({type: "id", value: n})
                    : ({type: "fun", value: n})
            )
            const factor = gram.production({
                left: term,
                right: gram.production({
                    op: opFactor,
                    value: term
                }).mapped(
                    n => n.op === "*" ? { mul: n.value } : { div: n.value }, 
                    n => n.mul !== undefined ? { op: "*", value: n.mul } : { op: "/", value: n.div}
                ).zeroOrMore()
            }).mapped(
                n => onOrMany({ mul: n.left }, ...n.right), 
                n => ({ left: n[0].mul, right: n.splice(1) })
            )
            const exp = gram.production({
                left: gram.production({
                    op: opAdd.optional(),
                    value: factor
                }).mapped(
                    n => n.op === "-" ? { minus: n.value } : { plus: n.value }, 
                    n => n.plus !== undefined ? { op: null, value: n.plus } : { op: "-", value: n.minus}
                ),
                right: gram.production({
                    op: opAdd,
                    value: factor
                }).mapped(
                    n => n.op === "-" ? { minus: n.value } : { plus: n.value }, 
                    n => n.plus !== undefined ? { op: "+", value: n.plus } : { op: "-", value: n.minus}
                ).zeroOrMore() 
            }).mapped(
                n => onOrMany(n.left , ...n.right), 
                n => ({ left: n[0], right: n.splice(1) })
            )
            return [exp, { exp, funCall, term, factor }] 
        })

        it.skip("generates random parse trees", () => {
            const tree = productions.exp.random()
            console.log([...productions.exp.tokens(tree)]
                .map(t => t.lexeme)
                .reduce((a, b) => a.concat(b), "")
            )
        })

    })

    describe("ll1EligiblityProblems", () => {

        it("returns empty array if no LL(1) ambiguities in grammar", () => {
            const symbols = gram.recursively(self => {
                const param = gram.production({
                    parenOpen,
                    arg: self,
                    parenClose
                })
                const funCall = gram.production({
                    funName: identifier,
                    param: param.optional()
                })
                const term = gram.choice(
                    floatLit.as("lit"),
                    funCall.as("fun"),
                    param.as("parenthesized")
                )
                const factor = gram.production({
                    left: term,
                    right: gram.production({
                        op: opFactor,
                        value: term
                    }).zeroOrMore()
                })
                const exp = gram.production({
                    left: gram.production({
                        op: opAdd.optional(),
                        value: factor
                    }),
                    right: gram.production({
                        op: opAdd,
                        value: factor
                    }).zeroOrMore() 
                })
                return [exp, { exp, funCall, term, factor, param }] 
            })
            const g = new gram.Grammar(symbols.exp)
            console.log(g.symbols.values())
            const problems = g.ll1EligiblityProblems();
            console.log(problems)
            expect(problems).to.be.empty
        })

        it("returns a problem when an optional symbol is followed by another sharing some first tokens", () => {
            const g = new gram.Grammar(gram.production({
                optional: identifier.optional(),
                required: identifier
            }))
            const problems = g.ll1EligiblityProblems();
            console.log(problems)
            expect(problems).to.be.not.empty
        })

        it("returns a problem when an choice symbol has productions sharing the same first symbols", () => {
            const g = new gram.Grammar(gram.production({
                first: identifier,
                choice: gram.choice(
                    identifier.as("prod1"),
                    identifier.as("prod2"),
                ),
                second: identifier
            }))
            const problems = g.ll1EligiblityProblems();
            console.log(problems)
            expect(problems).to.be.not.empty
        })

    }) 

})

function aSetEqualTo<T>(expected: Set<T>): Function {
    return (actual: Set<T>) => {
        expect(actual.size).to.equal(expected.size);
        for (const t of expected) {
            expect(actual.has(t)).to.be.true;
        }
        for (const t of actual) {
            expect(expected.has(t)).to.be.true;
        }
        return true;
    };
}

function onOrMany<T, H extends T, L extends T>(...args: [H, ...L[]]): [H, ...L[]] {
    return args
}