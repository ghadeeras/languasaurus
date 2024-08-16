import * as rex from "../prod/regex.js";
import * as tokens from "../prod/tokens.js";
import * as gram from "../prod/grammar.js";
import { expect } from 'chai'

const booleanTerm = gram.terminal(new tokens.BooleanTokenType(rex.choice(
    rex.word("true"), 
    rex.word("false")
)))
const intTerm = gram.terminal(new tokens.IntegerTokenType(rex.oneOrMore(rex.charIn("0-9"))))
const floatTerm = gram.terminal(new tokens.FloatTokenType(rex.concat(
    rex.zeroOrMore(rex.charIn("0-9")), 
    rex.char("."), 
    rex.oneOrMore(rex.charIn("0-9"))
)))
const identifier = gram.terminal(new tokens.TextualTokenType(rex.concat(
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
            const production = gram.production("op", {opCode: identifier, op1: identifier, op2: intTerm});
            const g = new gram.Grammar(production)

            expect(g).to.satisfy(containmentOf(production))
            expect(g).to.satisfy(containmentOf(identifier))
            expect(g).to.satisfy(containmentOf(intTerm))
        })

        it("collects symbols wrapped in choices", () => {
            const varExp = gram.production("var", {id: identifier});
            const numExp = gram.production("num", {val: intTerm});
            const exp = gram.choice(varExp, numExp)
            const g = new gram.Grammar(exp)

            exp.process({type: "num", content: {val: 123}})

            expect(g).to.satisfy(containmentOf(exp))
            expect(g).to.satisfy(containmentOf(varExp))
            expect(g).to.satisfy(containmentOf(numExp))
            expect(g).to.satisfy(containmentOf(identifier))
            expect(g).to.satisfy(containmentOf(intTerm))
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
            const idsArray = gram.production("ids", {array: zeroOrMorelId}).oneOrMore()
            const g1 = new gram.Grammar(oneOrMorelId)
            const g2 = new gram.Grammar(idsArray)

            expect(g1.isOptional(oneOrMorelId)).to.be.false
            expect(g2.isOptional(idsArray)).to.be.true
        })

        it("determines productions to be optional if all its symbols are optional", () => {
            const tuple = gram.production("tuple", {left: identifier.optional(), right: identifier.optional()})
            const g = new gram.Grammar(tuple)

            expect(g.isOptional(tuple)).to.be.true
        })

        it("determines productions to be non-optional if any of its symbols is non-optional", () => {
            const tuple1 = gram.production("tuple1", {left: identifier, right: identifier.optional()})
            const tuple2 = gram.production("tuple2", {left: identifier.optional(), right: identifier})
            const tuple3 = gram.production("tuple3", {left: identifier, right: identifier})
            const g = new gram.Grammar(gram.choice(tuple1, tuple2, tuple3))

            expect(g.isOptional(tuple1)).to.be.false
            expect(g.isOptional(tuple2)).to.be.false
            expect(g.isOptional(tuple3)).to.be.false
        })

        it("determines choices to be optional if any of its productions is optional", () => {
            const choice1 = gram.choice(gram.production("var", {id: identifier}), gram.production("num", {val: intTerm.optional()}))
            const choice2 = gram.choice(gram.production("var", {id: identifier.optional()}), gram.production("num", {val: intTerm}))
            const choice3 = gram.choice(gram.production("var", {id: identifier.optional()}), gram.production("num", {val: intTerm.optional()}))
            const g = new gram.Grammar(gram.production("prod", {c1: choice1, c2: choice2, c3: choice3}))

            expect(g.isOptional(choice1)).to.be.true
            expect(g.isOptional(choice2)).to.be.true
            expect(g.isOptional(choice3)).to.be.true
        })

        it("determines choices to be non-optional if all its symbols are non-optional", () => {
            const choice = gram.choice(gram.production("var", {id: identifier}), gram.production("num", {val: intTerm}))
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
                gram.production("id", { name: identifier }),
                gram.production("int", { value: intTerm })
            );
            const g = new gram.Grammar(choice)

            expect(g.firstSetOf(choice)).to.deep.equal(new Set([
                ...g.firstSetOf(identifier),
                ...g.firstSetOf(intTerm),
            ]))
        })

        it("is the union of first sets of the leading optional symbols and the first non-optional symbol, for a production", () => {
            const prod = gram.production("id", { 
                a: identifier.optional(), 
                b: intTerm, 
                c: booleanTerm.optional(), 
                d: floatTerm 
            });
            
            const g = new gram.Grammar(prod)

            expect(g.firstSetOf(prod)).to.deep.equal(new Set([
                ...g.firstSetOf(identifier),
                ...g.firstSetOf(intTerm),
            ]))
        })

    })

    describe("follow set", () => {

        function grammar<T, N>(symbol: gram.Symbol<T>, next: gram.Symbol<N>) {
            return new gram.Grammar(gram.production("prod", { symbol, next }))
        }

        function hasEmptyFollowSet<T>(symbol: gram.Repeatable<T>) {
            expect(grammar(symbol, booleanTerm).followSetOf(symbol)).to.deep.equal(new Set());
            expect(grammar(symbol.optional(), booleanTerm).followSetOf(symbol)).to.deep.equal(new Set());
            expect(grammar(symbol.zeroOrMore(), booleanTerm).followSetOf(symbol)).to.deep.equal(new Set());
            expect(grammar(symbol.oneOrMore(), booleanTerm).followSetOf(symbol)).to.deep.equal(new Set());
        }

        function hasFollowSetContainingFollowingFirstSets<T>(symbol: gram.Symbol<T>) {
            const choice = gram.choice(
                gram.production("int", { value: intTerm }),
                gram.production("float", { value: floatTerm })
            );
            const g1 = grammar(symbol, choice);
            const prod = gram.production("tuple", {
                int: intTerm.optional(),
                float: floatTerm,
                bool: booleanTerm
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
                gram.production("int", { value: intTerm}),
                gram.production("float", { value: floatTerm}),
            ))
        })

        it("is the first set of the following symbols, for optional choices", () => {
            hasFollowSetContainingFollowingFirstSets(gram.choice(
                gram.production("int", { value: intTerm}),
                gram.production("float", { value: floatTerm.optional()}),
            ))
            hasFollowSetContainingFollowingFirstSets(gram.choice(
                gram.production("int", { value: intTerm.optional()}),
                gram.production("float", { value: floatTerm}),
            ))
            hasFollowSetContainingFollowingFirstSets(gram.choice(
                gram.production("int", { value: intTerm.optional()}),
                gram.production("float", { value: floatTerm.optional()}),
            ))
        })

        it("is always empty, for productions with at least one non-optional symbol", () => {
            hasEmptyFollowSet(gram.production("tuple", {
                a: intTerm.optional(),
                b: floatTerm
            }))
            hasEmptyFollowSet(gram.production("tuple", {
                a: intTerm,
                b: floatTerm.optional()
            }))
            hasEmptyFollowSet(gram.production("tuple", {
                a: intTerm,
                b: floatTerm
            }))
        })

        it("is the first set of the following symbols, for productions with all-optional sybols", () => {
            hasFollowSetContainingFollowingFirstSets(gram.production("tuple", {
                a: intTerm.optional(),
                b: floatTerm.optional()
            }))
        })

    })

})