import * as rex from "../prod/regex.js";
import * as tokens from "../prod/tokens.js";
import * as gram from "../prod/grammar.js";
import { expect } from 'chai'
import { LazyEvaluator } from "../prod/utils.js";

const booleanLit = gram.terminal(tokens.booleanToken(rex.choice(
    rex.word("true"), 
    rex.word("false")
)))
const intLit = gram.terminal(tokens.integerToken(rex.oneOrMore(rex.charIn("0-9"))))
const floatLit = gram.terminal(tokens.floatToken(rex.concat(
    rex.zeroOrMore(rex.charIn("0-9")), 
    rex.char("."), 
    rex.oneOrMore(rex.charIn("0-9"))
)))
const identifier = gram.terminal(tokens.textualToken(rex.concat(
    rex.oneOrMore(rex.choice(
        rex.charIn("a-z"),
        rex.charIn("A-Z")
    )),
    rex.oneOrMore(rex.choice(
        rex.char("_"),
        rex.charIn("0-9"),
        rex.charIn("a-z"),
        rex.charIn("A-Z")
    ))
)))
const parenOpen = gram.terminal(tokens.textualToken(rex.word("(")))
const parenClose = gram.terminal(tokens.textualToken(rex.word(")")))
const opFactor = gram.terminal(tokens.textualToken(rex.charFrom("*/")))
const opAdd = gram.terminal(tokens.textualToken(rex.charFrom("+-")))

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
            const exp = gram.choice(varExp, numExp)
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
            const tuple1 = gram.production({left: identifier, right: identifier.optional()})
            const tuple2 = gram.production({left: identifier.optional(), right: identifier})
            const tuple3 = gram.production({left: identifier, right: identifier})
            const g = new gram.Grammar(gram.choice(tuple1, tuple2, tuple3))

            expect(g.isOptional(tuple1)).to.be.false
            expect(g.isOptional(tuple2)).to.be.false
            expect(g.isOptional(tuple3)).to.be.false
        })

        it("determines choices to be optional if any of its productions is optional", () => {
            const choice1 = gram.choice(gram.production( {id: identifier}), gram.production({val: intLit.optional()}))
            const choice2 = gram.choice(gram.production( {id: identifier.optional()}), gram.production({val: intLit}))
            const choice3 = gram.choice(gram.production( {id: identifier.optional()}), gram.production({val: intLit.optional()}))
            const g = new gram.Grammar(gram.production( {c1: choice1, c2: choice2, c3: choice3}))

            expect(g.isOptional(choice1)).to.be.true
            expect(g.isOptional(choice2)).to.be.true
            expect(g.isOptional(choice3)).to.be.true
        })

        it("determines choices to be non-optional if all its symbols are non-optional", () => {
            const choice = gram.choice(gram.production({id: identifier}), gram.production({val: intLit}))
            const g = new gram.Grammar(choice)

            expect(g.isOptional(choice)).to.be.false
        })

    })

    describe("first set", () => {

        it("has the wrapped token type, for a terminal", () => {
            const g = new gram.Grammar(identifier)

            expect(g.firstSetOf(identifier)?.size).to.equal(1)
            expect(g.firstSetOf(identifier)).to.contain(identifier.tokenType)
        })

        it("is the first set of wrapped symbol, for an optional", () => {
            const optional = identifier.optional();
            const g = new gram.Grammar(optional)

            expect(g.firstSetOf(optional)).to.deep.equal(g.firstSetOf(identifier))
        })

        it("is the first set of wrapped symbol, for a zero-or-more", () => {
            const zeroOrMore = identifier.zeroOrMore();
            const g = new gram.Grammar(zeroOrMore)

            expect(g.firstSetOf(zeroOrMore)).to.deep.equal(g.firstSetOf(identifier))
        })

        it("is the first set of wrapped symbol, for a one-or-more", () => {
            const oneOrMore = identifier.oneOrMore();
            const g = new gram.Grammar(oneOrMore)

            expect(g.firstSetOf(oneOrMore)).to.deep.equal(g.firstSetOf(identifier))
        })

        it("is the union of first sets of wrapped symbols, for a choice", () => {
            const choice = gram.choice(
                gram.production({ name: identifier }),
                gram.production({ value: intLit })
            );
            const g = new gram.Grammar(choice)

            expect(g.firstSetOf(choice)).to.deep.equal(new Set([
                ...g.firstSetOf(identifier),
                ...g.firstSetOf(intLit),
            ]))
        })

        it("is the union of first sets of the leading optional symbols and the first non-optional symbol, for a production", () => {
            const prod = gram.production({ 
                a: identifier.optional(), 
                b: intLit, 
                c: booleanLit.optional(), 
                d: floatLit 
            });
            
            const g = new gram.Grammar(prod)

            expect(g.firstSetOf(prod)).to.deep.equal(new Set([
                ...g.firstSetOf(identifier),
                ...g.firstSetOf(intLit),
            ]))
        })

    })

    describe("follow set", () => {

        function grammar<T, N>(symbol: gram.Symbol<T>, next: gram.Symbol<N>) {
            return new gram.Grammar(gram.production({ symbol, next }))
        }

        function hasEmptyFollowSet<T>(symbol: gram.Repeatable<T>) {
            expect(grammar(symbol, booleanLit).followSetOf(symbol)).to.deep.equal(new Set());
            expect(grammar(symbol.optional(), booleanLit).followSetOf(symbol)).to.deep.equal(new Set());
            expect(grammar(symbol.zeroOrMore(), booleanLit).followSetOf(symbol)).to.deep.equal(new Set());
            expect(grammar(symbol.oneOrMore(), booleanLit).followSetOf(symbol)).to.deep.equal(new Set());
        }

        function hasFollowSetContainingFollowingFirstSets<T>(symbol: gram.Symbol<T>) {
            const choice = gram.choice(
                gram.production({ value: intLit }),
                gram.production({ value: floatLit })
            );
            const g1 = grammar(symbol, choice);
            const prod = gram.production({
                int: intLit.optional(),
                float: floatLit,
                bool: booleanLit
            });
            const g2 = grammar(symbol, prod);

            expect(g1.followSetOf(symbol)).to.deep.equal(g1.firstSetOf(choice));
            expect(g2.followSetOf(symbol)).to.deep.equal(g2.firstSetOf(prod));
        }
    
        it("is always empty, for terminals", () => {
            hasEmptyFollowSet(identifier);
        })

        it("is the first set of the following symbols, for optionals", () => {
            hasFollowSetContainingFollowingFirstSets(identifier.optional());
        })

        it("is the first set of the following symbols, for zero-or-more", () => {
            hasFollowSetContainingFollowingFirstSets(identifier.zeroOrMore());
        })

        it("is always empty, for non-optional choices", () => {
            hasEmptyFollowSet(gram.choice(
                gram.production({ value: intLit}),
                gram.production({ value: floatLit}),
            ))
        })

        it("is the first set of the following symbols, for optional choices", () => {
            hasFollowSetContainingFollowingFirstSets(gram.choice(
                gram.production({ value: intLit}),
                gram.production({ value: floatLit.optional()}),
            ))
            hasFollowSetContainingFollowingFirstSets(gram.choice(
                gram.production({ value: intLit.optional()}),
                gram.production({ value: floatLit}),
            ))
            hasFollowSetContainingFollowingFirstSets(gram.choice(
                gram.production({ value: intLit.optional()}),
                gram.production({ value: floatLit.optional()}),
            ))
        })

        it("is always empty, for productions with at least one non-optional symbol", () => {
            hasEmptyFollowSet(gram.production({
                a: intLit.optional(),
                b: floatLit
            }))
            hasEmptyFollowSet(gram.production({
                a: intLit,
                b: floatLit.optional()
            }))
            hasEmptyFollowSet(gram.production({
                a: intLit,
                b: floatLit
            }))
        })

        it("is the first set of the following symbols, for productions with all-optional sybols", () => {
            hasFollowSetContainingFollowingFirstSets(gram.production({
                a: intLit.optional(),
                b: floatLit.optional()
            }))
        })

    })

    describe("random", () => {

        const productions = gram.recursively("exp", (self: gram.Repeatable<any>) => {
            const funCall = gram.production({
                funName: identifier.optional(),
                parenOpen,
                arg: self,
                parenClose
            }).mapped(
                n => ({ funName: n.funName, arg: n.arg}), 
                unsupported
            )
            const term = gram.choice(
                floatLit,
                identifier,
                funCall
            )
            const factor = gram.production({
                left: term,
                right: gram.production({
                    op: opFactor,
                    value: term
                }).mapped(
                    n => n.op === "*" ? { mul: n.value } : { div: n.value }, 
                    unsupported
                ).zeroOrMore()
            }).mapped(
                n => n.right.length > 0 ? ([{ mul: n.left }, ...n.right]) : n.left, 
                unsupported
            )
            const exp = gram.production({
                left: factor,
                right: gram.production({
                    op: opAdd,
                    value: factor
                }).mapped(
                    n => n.op === "+" ? { plus: n.value } : { minus: n.value }, 
                    unsupported
                ).zeroOrMore() 
            }).mapped(
                n => n.right.length > 0 ? ([{ plus: n.left }, ...n.right]) : n.left, 
                unsupported
            )
            return { exp, funCall, term, factor } 
        })

        // it("generates random parse trees", () => {
        //     var evaluator = new LazyEvaluator()
        //     const tree = productions.exp.random(evaluator);
        //     console.log(JSON.stringify(evaluator.await(tree), null, 4))
        // })

    })

})

function unsupported<T>(): T {
    throw new Error("unsupported")
}