import { expect } from 'chai';
import * as charsets  from '../prod/charsets.js';
import * as automata from '../prod/automata.js'

describe("automata", () => {

    const recognizables = ["a", "b", "c"]
    const startState = automata.state<string>()
    const endState = automata.state(...recognizables)
    
    startState.on(charsets.chars("123"), endState)
    
    const automaton = automata.automaton(startState) 

    describe("State", () => {
        
        it("allows adding more transitions using the 'on' method only", () => {
            expect(startState.transitions).to.have.lengthOf(1)
            expect(endState.transitions).to.have.lengthOf(0)

            endState.transitions.push(...startState.transitions)
            expect(endState.transitions).to.have.lengthOf(0)

            endState.on(charsets.chars("456"), startState)
            expect(endState.transitions).to.have.lengthOf(1)
        })

        it("encapsulatees the recognizables well", () => {
            expect(startState.recognizables).to.have.lengthOf(0)
            expect(endState.recognizables).to.have.lengthOf(recognizables.length)

            startState.recognizables.push(...endState.recognizables)
            expect(startState.recognizables).to.have.lengthOf(0)
        })
    })

    describe("Automaton", () => {

        it("encapsulates its states well", () => {
            const s = automata.state("meow")
            automaton.states.push(s)
            automaton.finalStates.push(s)
            automaton.transientStates.push(s)

            expect(automaton.states).to.not.include(s)
            expect(automaton.finalStates).to.not.include(s)
            expect(automaton.transientStates).to.not.include(s)
        })

        it(">>>encapsulates its matcher well", () => {
            const matcher = automaton.newMatcher()
            expect(matcher.lastRecognized).to.be.empty
            expect(matcher.recognized).to.be.empty

            matcher.lastRecognized.push("1")
            matcher.recognized.push("2")
            expect(matcher.lastRecognized).to.be.empty
            expect(matcher.recognized).to.be.empty
        })

    })

})