import { expect } from 'chai'
import * as utils  from '../prod/utils.js'
import * as charsets  from '../prod/charsets.js'
import * as regex from '../prod/regex.js'

describe("regex", () => {
    
    describe("charIn (one range)", () => {

        const r = regex.charIn("a..z")

        it("recognizes strings of one character that is in specified range", () => {
            expect(r.matches("g")).to.be.true
            expect(r.matches("G")).to.be.false
            expect(r.matches("5")).to.be.false
            expect(r.matches("")).to.be.false            
            expect(r.matches("abcdefg")).to.be.false            
            expect(r.find("abcdefg")).to.deep.equal([0, 1])            
            expect(r.matches("1g2")).to.be.false            
            expect(r.find("1g2")).to.deep.equal([1, 2])            
        })

        it("generates strings of one character that is in specified range", () => {
            expect(r.random().length).to.equal(1)
            expect(r.random().charCodeAt(0)).to.be.within("a".charCodeAt(0), "z".charCodeAt(0))
        })

    })

    describe("charIn (many ranges)", () => {

        const rAnUz = regex.charIn("a..n", "u..z")
        const rAnOz = regex.charIn("a..n", "o..z")
        const rAnHz = regex.charIn("a..n", "h..z")

        const rAn = regex.charIn("a..n")
        const rHz = regex.charIn("h..z")
        const rAz = regex.charIn("a..z")
        const rUz = regex.charIn("u..z")
        const rOz = regex.charIn("o..z")

        it("recognizes strings of one character that is in specified ranges", () => {
            expect(rAnUz.matches(rAn.random())).to.be.true
            expect(rAnUz.matches(rUz.random())).to.be.true
            expect(rAnUz.automaton.startState.transitions).to.have.lengthOf(1)
        })

        it("recognizes strings of one character that is in specified adjacent ranges", () => {
            expect(rAnOz.matches(rAn.random())).to.be.true
            expect(rAnOz.matches(rOz.random())).to.be.true
            expect(rAnOz.matches(rAz.random())).to.be.true
            expect(rAnOz.automaton.startState.transitions).to.have.lengthOf(1)
        })

        it("recognizes strings of one character that is in specified overlapping ranges", () => {
            expect(rAnHz.matches(rAn.random())).to.be.true
            expect(rAnHz.matches(rHz.random())).to.be.true
            expect(rAnHz.matches(rAz.random())).to.be.true
            expect(rAnHz.automaton.startState.transitions).to.have.lengthOf(1)
        })

        it("generates strings of one character that is in specified ranges", () => {
            const s = rAnUz.random();
            expect(rAn.matches(s) || rUz.matches(s)).to.be.true
            expect(rAn.matches(s) && rUz.matches(s)).to.be.false
        })

        it("generates strings of one character that is in specified adjacent ranges", () => {
            const s = rAnOz.random();
            expect(rAn.matches(s) || rOz.matches(s)).to.be.true
            expect(rAn.matches(s) && rOz.matches(s)).to.be.false
            expect(rAz.matches(s)).to.be.true
        })

        it("generates strings of one character that is in specified overlapping ranges", () => {
            const s = rAnHz.random();
            expect(rAn.matches(s) || rHz.matches(s)).to.be.true
            expect(rAz.matches(s)).to.be.true
        })

    })

    describe("charOutOf", () => {

        const r = regex.charOutOf("b..y")
        const r1 = regex.charIn(String.fromCharCode(0) + "a", "z" + String.fromCharCode(0xFFFF))
        const r2 = regex.charIn("b..y")

        it("recognizes strings of one character that is NOT in specified range", () => {
            expect(r.matches(r1.random())).to.be.true
            expect(r.matches(r2.random())).to.be.false
            expect(r.automaton.startState.transitions).to.have.lengthOf(1)
        })

        it("generates strings of one character that is NOT in specified range", () => {
            expect(r1.matches(r.random())).to.be.true
            expect(r2.matches(r.random())).to.be.false
        })

    })

    describe("char(Not)From", () => {

        const chars = "aeimqux"
        const one = regex.charFrom(chars)
        const none = regex.charNotFrom(chars)

        it("recognizes strings of one character that is in/out of specified chars", () => {
            for (let i = 0; i < chars.length; i++) {
                const c = chars.charAt(i)
                expect(one.matches(c)).to.be.true
                expect(none.matches(c)).to.be.false
            }
            expect(one.automaton.startState.transitions).to.have.lengthOf(1)
            expect(none.automaton.startState.transitions).to.have.lengthOf(1)
        })

        it("generates strings of one character that is in/out of specified chars", () => {
            const c1 = one.random()
            const c2 = none.random()
            expect(c1).to.have.length(1)
            expect(c2).to.have.length(1)
            expect(chars.indexOf(c1)).to.be.gte(0)
            expect(chars.indexOf(c2)).to.be.lt(0)
        })

    })

    describe("word", () => {

        const r = regex.word("keyWord")

        it("recognizes only the one specified string of characters", () => {
            expect(r.matches("keyWord")).to.be.true
            expect(r.matches("...keyWord")).to.be.false
            expect(r.matches("keyWord...")).to.be.false
            expect(r.find("...keyWord...")).to.deep.equal([3, 10])
        })

        it("generates only the one specified string of characters", () => {
            expect(r.random()).to.equal("keyWord")
        })

    })

    describe("optional", () => {

        const r = regex.word("keyWord").optional()

        it("recognizes the specified string", () => {
            expect(r.matches("keyWord")).to.be.true
            expect(r.matches("...keyWord")).to.be.false
            expect(r.matches("keyWord...")).to.be.false
            expect(r.shortestMatch("keyWord")).to.equal(0)
            expect(r.longestMatch("keyWord")).to.equal("keyWord".length)
        })

        it("recognizes the empty string", () => {
            expect(r.matches("")).to.be.true
            expect(r.matches("key")).to.be.false
        })

        it("generates the specified string or an empty string", () => {
            let randoms: string[] = [];
            for (let i = 0; i < 100; i++) {
                randoms.push(r.random())
            }
            randoms = utils.distinct(randoms, (s1, s2) => s1.localeCompare(s2))
            expect(randoms).to.deep.equal(["", "keyWord"])
        })

        it("does nothing if expression is already optional", () => {
            const rr = r.optional()
            expect(rr).to.satisfy(equivalentTo(r))
        })

        it("handles initial optional repetitions", () => {
            const rr = regex.concat(
                regex.zeroOrMore(regex.word("Yes, ")),
                regex.word("Please!")
            ).optional()

            expect(rr.matches("Please!")).to.be.true
            expect(rr.matches("Yes, Please!")).to.be.true
            expect(rr.matches("Yes, ")).to.be.false
        })

    })

    describe("choice", () => {

        const r1 = regex.word("aKeyWord")
        const r2 = regex.word("anotherKeyWord")
        const r = regex.choice(r1, r2)

        it("recognizes any of the specified expressions", () => {
            expect(r.matches(r1.random())).to.be.true
            expect(r.matches(r2.random())).to.be.true
        })

        it("generates one of the specified expressions", () => {
            for (let i = 0; i < 100; i++) {
                const random = r.random()
                expect(r1.matches(random) || r2.matches(random)).to.be.true
            }
        })

        it("produces an optional expression only if at least one choice is optional", () => {
            expect(r1.or(r2).automaton.isOptional).to.be.false
            expect(r1.optional().or(r2).automaton.isOptional).to.be.true
            expect(r1.or(r2.optional()).automaton.isOptional).to.be.true
            expect(r1.optional().or(r2.optional()).automaton.isOptional).to.be.true
        })

        it("produces the most general expression if it contains other choices", () => {
            const general = regex.concat(
                regex.charIn("a-z", "A-Z"),
                regex.zeroOrMore(regex.charIn("a-z", "A-Z", "0-9"))
            )
            const special = regex.word("fun")
            const union = regex.choice(general, special)
            expect(union).to.satisfy(equivalentTo(general))
        })

        it("handles initial optional repetitions in one of the choices", () => {
            const rr =  regex.choice(
                regex.concat(
                    regex.zeroOrMore(regex.charIn("0-9")),
                    regex.charFrom("."),
                    regex.oneOrMore(regex.charIn("0-9"))
                ),
                regex.charFrom("$")
            )
            expect(rr.matches(".123")).to.be.true
            expect(rr.matches("123.456")).to.be.true
            expect(rr.matches("$")).to.be.true
            expect(rr.matches(".$")).to.be.false
            expect(rr.matches(".123$")).to.be.false
            expect(rr.matches("123.$")).to.be.false
            expect(rr.matches("123$")).to.be.false
        })

    })

    describe("concat", () => {

        const r1 = regex.word("one")
        const r2 = regex.word("two")
        const r3 = regex.word("three")

        it("handles multiple final states", () => {
    
            expect(regex.concat(r1, r2, r3.optional())).to.satisfy(equivalentTo(
                regex.choice(
                    r1.then(r2),
                    r1.then(r2).then(r3)
                )
            ))    

            expect(regex.concat(r1.optional(), r2.optional(), r3)).to.satisfy(equivalentTo(
                regex.choice(
                    r3,
                    r1.then(r3),
                    r2.then(r3),
                    r1.then(r2).then(r3)
                )
            ))    
    
            expect(regex.concat(r1.optional(), r2, r3)).to.satisfy(equivalentTo(
                regex.choice(
                    r2.then(r3),
                    r1.then(r2).then(r3)
                )
            ))    
    
            expect(regex.concat(r1, r2.optional(), r3.optional())).to.satisfy(equivalentTo(
                regex.choice(
                    r1,
                    r1.then(r2),
                    r1.then(r3),
                    r1.then(r2).then(r3)
                )
            ))    
    
            expect(regex.concat(r1, r2.optional(), r3)).to.satisfy(equivalentTo(
                regex.choice(
                    r1.then(r3),
                    r1.then(r2).then(r3)
                )
            ))    
    
            expect(regex.concat(r1.optional(), r2, r3.optional())).to.satisfy(equivalentTo(
                regex.choice(
                    r2,
                    r1.then(r2),
                    r2.then(r3),
                    r1.then(r2).then(r3)
                )
            ))    
        })

        it("produces an optional expression only if every factor is optional", () => {
            expect(r1.then(r2).automaton.isOptional).to.be.false
            expect(r1.optional().then(r2).automaton.isOptional).to.be.false
            expect(r1.then(r2.optional()).automaton.isOptional).to.be.false
            expect(r1.optional().then(r2.optional()).automaton.isOptional).to.be.true
        })

    })

    describe("repeated", () => {

        const r1 = regex.word("one")
        const r2 = regex.word("two")

        const rs = [
            r1,
            r1.or(r2),
            r1.then(r2.optional()),
            r1.optional().then(r2)
        ]

        it("recognizes/generates repeated patterns", () => {
            for (const r of rs) {
                expect(r.repeated()).to.satisfy(equivalentToRepeated(r))
            }
        })

        it("recognizes/generates repeated zero-or-more patterns", () => {
            for (const r of rs) {
                const zeroOrMoreRs = regex.zeroOrMore(r);
                const oneOrMoreRs = regex.oneOrMore(r);
                const rThenZeroOrMoreRs = r.then(zeroOrMoreRs);
                expect(rThenZeroOrMoreRs).to.satisfy(equivalentTo(oneOrMoreRs))
            }
        })

    })

    describe("determinism", () => {

        it("handles overlaps", () => {
            const one = regex.word("1")
            const two = regex.word("2")

            const rAn = regex.charIn("a..n")
            const rHz = regex.charIn("h..z")

            const rAt = regex.charIn("a..t")
            const rNz = regex.charIn("n..z")

            const rAg = regex.charIn("a..g")
            const rHn = regex.charIn("h..n")
            const rOz = regex.charIn("o..z")
            
            const rAm = regex.charIn("a..m")
            const rNt = regex.charIn("n..t")
            const rUz = regex.charIn("u..z")

            const r = regex.choice(
                regex.concat(rAn, rAt, one),
                regex.concat(rHz, rNz, two)
            )

            const deterministicR = regex.choice(
                regex.concat(rAg, rAt, one),
                regex.concat(rOz, rNz, two),
                regex.concat(rHn, regex.choice(
                    regex.concat(rAm, one),
                    regex.concat(rUz, two),
                    regex.concat(rNt, regex.choice(
                        one,
                        two
                    ))
                )),
            )

            expect(r).to.satisfy(equivalentTo(deterministicR))
        })

    })

    function equivalentTo(expectedR: regex.RegEx): utils.Mapper<regex.RegEx, boolean> {
        return actualR => {
            // console.log("Expecting the following automaton: \n\n" + actualR.automaton.toString())
            // console.log("\n\n ... to be equivalent to the following automaton:\n\n" + actualR.automaton.toString())
            for (let i = 0; i < 100; i++) {
                const actualRandom = actualR.random();
                const expectedRandom = expectedR.random();
                expect(expectedR.matches(actualRandom), `Bad random value: ${actualRandom}`).to.be.true
                expect(actualR.matches(expectedRandom), `Could not match valid string: ${expectedRandom}`).to.be.true
            }
            return true
        }
    }

    function equivalentToRepeated(expectedR: regex.RegEx): utils.Mapper<regex.RegEx, boolean> {
        return actualR => {
            for (let i = 0; i < 100; i++) {
                const actualRandom = actualR.random();
                let expectedRandom = expectedR.random();
                let c = 0;
                while (Math.random() >= 0.5) {
                    expectedRandom += expectedR.random();
                    c++
                }
                for (let j = 0; j < actualRandom.length;) {
                    j = expectedR.longestMatch(actualRandom, j) || actualRandom.length + 1
                    expect(j <= actualRandom.length, `Bad random value: ${actualRandom}`).to.be.true
                }
                expect(actualR.matches(expectedRandom), `Could not match valid string: ${expectedRandom}`).to.be.true
            }
            return true
        }
    }

    describe("encapsulation", () => {

        const startState = regex.state()
        const endState = regex.endState()
        
        startState.on(charsets.chars("123"), endState)
        
        const r = regex.from(startState) 
        
        it("is well isolated from changes to its input", () => {
            expect(r.matches("1")).to.be.true
            expect(r.matches("4")).to.be.false

            startState.on(charsets.chars("4"), endState)
            expect(r.matches("1")).to.be.true
            expect(r.matches("4")).to.be.false
        })

        it("encapsulates its automaton well", () => {
            expect(r.matches("1")).to.be.true
            expect(r.matches("4")).to.be.false

            r.automaton.startState.on(charsets.chars("4"), endState)
            expect(r.matches("1")).to.be.true
            expect(r.matches("4")).to.be.false
        })
    })

})