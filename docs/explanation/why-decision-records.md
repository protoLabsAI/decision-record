# Upstream canon: Joel Parker Henderson's Decision Record

This document preserves the canonical explanation of decision records (DRs) authored by [Joel Parker Henderson](https://joelparkerhenderson.com). This project is a derivative work that builds tooling on top of Joel's canonical concept; the explanatory content below is retained here verbatim as both attribution and reference.

> Upstream: <https://github.com/joelparkerhenderson/decision-record>

---

# Decision record (DR)

A decision record (DR) is a way to initiate, debate, and archive an important choice, along with its context and consequences.

## What is a decision record?

A **decision record** (DR) is a way to initiate, debate, and archive an important choice, along with its context and consequences.

A **decision log** (DL) is the collection of all DRs created and maintained for a particular project (or organization).

A **decision** in this context is an organization's choice that addresses a significant requirement.

A **significant requirement** (SR) is a project's need that has a measurable effect on a project's system.

All these terms are within the topic of **knowledge management** (KM).

## Decision record template (canonical)

See [`templates/canonical.md`](../templates/canonical.md). The canonical template uses these major sections:

* **Title**: short present tense imperative up to 50 characters.
* **Status**: request for comments | proposed | accepted | rejected | deprecated | superseded
* **Issue**: describe the issue you want to address, and leave no questions about why.
* **Assumptions**: describe any assumptions, premises, cross-project requirements, etc.
* **Constraints**: capture any constraints to the environment this decision might pose.
* **Positions**: list the potential candidate options as facts and data, not opinions.
* **Opinions**: by the team and stakeholders, and also third-party advisors and reviewers.
* **Selection**: explain why you selected a position, with purpose and accountability.
* **Implications**: state your decision's implications, such as any need for changes.
* **Related**: such as for references, cross-project work, and follow on needs.

## Why are decision records better than just notes?

A decision record adds some structure to freeform notes.

A decision record template adds a list of items to cover, which functions as a checklist.

The important result is that teams can use decision records and templates to improve teamwork: the decision records and templates both work as checklists, that help the team ensure they cover all the bases, and they communicate efficiently and effectively.

The advantages of decision records tend to grow with team size, project expansion, integration opportunities, stakeholder involvement, long term maintenance, and evolution over time.

In practice, decision records encourage more participation among remote teammates, more asynchronous communication, more efficient evalation of options, and more summarization going forward. All of these aspects also help onboard new teammates because the decisions are clear, complete, succinct, and recorded.

## Suggestions for writing good decision records

Characteristics of a good decision record:

* **Point in time** — Identify when the decision was made
* **Rationality** — Explain the reason for making the particular decision.
* **Immutable record** — The decisions made in a previously published decision record should not be altered.
* **Specificity** — Each decision record should be about a single decision.

Characteristics of a good context in a decision record:

* Explain your organization's situation and business priorities
* Include rationale and considerations based on social and skills makeups of your teams.

A new decision record may take the place of a previous decision record:

* When a decision is made that replaces or invalidates a previous decision record, then create a new decision, and reference the old decision.

## Teamwork notes

You have an opportunity to lead your teammates, by talking together about the "why", rather than mandating the "what". Decision records are a way for teams to think smarter and communicate better; they are not valuable if they're just an after-the-fact forced paperwork requirement.

Some teams much prefer the name "decisions" over the abbreviation "decision records". When teams use the directory name "decisions", it's as if a light bulb turns on, and the team starts putting more information into the directory: vendor decisions, planning decisions, scheduling decisions, etc.

In theory, immutability is ideal. In practice, mutability has worked better for many teams: insert new info into the existing DR with a date stamp and a note that the info arrived after the decision. This leads to a "living document" the team can update — typical updates are new teammate input, new offerings, real-world results, or after-the-fact third-party changes (vendor capabilities, pricing, license agreements, etc.).

## For more information

Introduction:

* [Architectural decision record](https://github.com/joelparkerhenderson/architecture_decision_record)
* [Architectural decision (wikipedia.org)](https://wikipedia.org/wiki/Architectural_decision)
* [Architecturally significant requirements (wikipedia.org)](https://wikipedia.org/wiki/Architecturally_significant_requirements)

Templates:

* [Documenting architecture decisions — Michael Nygard](http://thinkrelevance.com/blog/2011/11/15/documenting-architecture-decisions)
* [Markdown Architectural Decision Records](https://adr.github.io/madr/)
* [Template for documenting architecture alternatives and decisions](http://stackoverflow.com/questions/7104735/template-for-documenting-architecture-alternatives-and-decisions)

See also:

* REMAP (Representation and Maintenance of Process Knowledge)
* DRL (Decision Representation Language)
* IBIS (Issue-Based Information System)
* QOC (Questions, Options, and Criteria)
