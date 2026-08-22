// Notion-style page templates. Stored as markdown so they round-trip with tiptap-markdown.
import type { ComponentType } from "react";
import {
  BookOpen,
  Calendar,
  FileText,
  Flag,
  ListChecks,
  Repeat,
  Rocket,
  Wallet,
  type IconProps,
} from "@/lib/icons";

export interface Template {
  id: string;
  name: string;
  description: string;
  icon: ComponentType<IconProps>;
  content: string;
}

export const TEMPLATES: Template[] = [
  {
    id: "todo",
    name: "To-do list",
    icon: ListChecks,
    description: "Daily checklist with priorities",
    content: `# To-do list

A simple way to track what needs to get done today.

## Today

- [ ] First important task
- [ ] Second task
- [ ] Third task

## This week

- [ ] Plan the week
- [ ] Review progress on Friday

## Someday

- [ ] Bigger ideas to come back to
`,
  },
  {
    id: "expense",
    name: "Expense tracker",
    icon: Wallet,
    description: "Track spending in a table",
    content: `# Expense tracker

Track your daily spending. Total it up at the end of the month.

| Date | Item | Category | Amount |
| ---- | ---- | -------- | ------ |
|      |      |          |        |
|      |      |          |        |
|      |      |          |        |

**Notes**

- Categories: Food, Transport, Entertainment, Bills, Other
- Review weekly and adjust budget
`,
  },
  {
    id: "meeting",
    name: "Meeting notes",
    icon: FileText,
    description: "Attendees, agenda, action items",
    content: `# Meeting notes

**Date:**
**Attendees:**

## Agenda

1. Topic one
2. Topic two
3. Topic three

## Discussion

> Notes from the conversation go here.

## Decisions

- Decision 1
- Decision 2

## Action items

- [ ] Owner — task — due date
- [ ] Owner — task — due date
`,
  },
  {
    id: "weekly",
    name: "Weekly planner",
    icon: Calendar,
    description: "Day columns, checkboxes, and a New week button",
    content: "",
  },
  {
    id: "habit",
    name: "Habit tracker",
    icon: Repeat,
    description: "Track habits across days",
    content: `# Habit tracker

Mark each day you complete the habit.

| Habit | Mon | Tue | Wed | Thu | Fri | Sat | Sun |
| ----- | --- | --- | --- | --- | --- | --- | --- |
| Read 20 min |  |  |  |  |  |  |  |
| Exercise |  |  |  |  |  |  |  |
| Sleep 8h |  |  |  |  |  |  |  |
| Meditate |  |  |  |  |  |  |  |

## Streak notes

> Celebrate wins, learn from misses.
`,
  },
  {
    id: "reading",
    name: "Reading list",
    icon: BookOpen,
    description: "Books to read and notes",
    content: `# Reading list

| Title | Author | Status | Rating | Notes |
| ----- | ------ | ------ | ------ | ----- |
|       |        | To read |  |  |
|       |        | Reading |  |  |
|       |        | Done   |  |  |

## Quotes

> Memorable lines worth coming back to.
`,
  },
  {
    id: "project",
    name: "Project tracker",
    icon: Rocket,
    description: "Tasks, owners, deadlines",
    content: `# Project tracker

**Project:**
**Owner:**
**Deadline:**

## Overview

> One-paragraph summary of what this project is and why it matters.

## Milestones

- [ ] Milestone 1 — date
- [ ] Milestone 2 — date
- [ ] Milestone 3 — date

## Tasks

| Task | Owner | Status | Due |
| ---- | ----- | ------ | --- |
|      |       | Todo   |     |
|      |       | Doing  |     |
|      |       | Done   |     |

## Risks & blockers

- 
`,
  },
  {
    id: "okr",
    name: "Goals / OKRs",
    icon: Flag,
    description: "Objective and key results",
    content: `# Goals / OKRs

**Quarter:**

## Objective

> What ambitious thing do you want to achieve?

## Key results

- [ ] KR 1 — measurable outcome
- [ ] KR 2 — measurable outcome
- [ ] KR 3 — measurable outcome

## Initiatives

1. Initiative one
2. Initiative two

## Weekly check-in

| Week | Progress | Notes |
| ---- | -------- | ----- |
| 1    |          |       |
| 2    |          |       |
| 3    |          |       |
`,
  },
];
