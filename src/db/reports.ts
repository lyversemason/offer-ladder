// The built-in reports. Each one is a plain .sql file in ./queries with a
// plain-English header; this list gives each a title and the question it answers.
// The browser demo runs them on SQLite. The local Postgres database (supabase/)
// runs the same file, or its Postgres version in ./queries/postgres when the two
// databases write something differently (dates, true/false, JSON).
import repScorecard from './queries/1-rep-scorecard.sql?raw'
import storeComparison from './queries/2-store-comparison.sql?raw'
import tierMix from './queries/3-tier-mix.sql?raw'
import whereDealsClose from './queries/4-where-deals-close.sql?raw'
import attachTrend from './queries/5-attach-trend.sql?raw'
import premiumShare from './queries/6-premium-share.sql?raw'
import exceptions from './queries/7-exceptions.sql?raw'
import companyByMonth from './queries/usage/1-company-by-month.sql?raw'
import storesByWeek from './queries/usage/2-stores-by-week.sql?raw'
import coverageByRep from './queries/usage/3-coverage-by-rep.sql?raw'
import ticketFunnel from './queries/usage/4-ticket-funnel.sql?raw'
import addingItems from './queries/usage/5-adding-items.sql?raw'
import priceChanges from './queries/usage/6-price-changes.sql?raw'
import scratchpad from './queries/usage/7-scratchpad.sql?raw'
import dataQuality from './queries/usage/8-data-quality.sql?raw'
import discountSize from './queries/patterns/1-discount-size.sql?raw'
import baseDiscount from './queries/patterns/2-base-discount.sql?raw'
import freeDelivery from './queries/patterns/3-free-delivery.sql?raw'
import financing from './queries/patterns/4-financing.sql?raw'
import secondOffers from './queries/patterns/5-second-offers.sql?raw'
import commissionGivenUp from './queries/patterns/6-commission-given-up.sql?raw'
import offeredVsSold from './queries/patterns/7-offered-vs-sold.sql?raw'
import pgRepScorecard from './queries/postgres/1-rep-scorecard.sql?raw'
import pgStoreComparison from './queries/postgres/2-store-comparison.sql?raw'
import pgAttachTrend from './queries/postgres/5-attach-trend.sql?raw'
import pgPremiumShare from './queries/postgres/6-premium-share.sql?raw'
import pgExceptions from './queries/postgres/7-exceptions.sql?raw'
import pgCompanyByMonth from './queries/postgres/usage/1-company-by-month.sql?raw'
import pgStoresByWeek from './queries/postgres/usage/2-stores-by-week.sql?raw'
import pgCoverageByRep from './queries/postgres/usage/3-coverage-by-rep.sql?raw'
import pgAddingItems from './queries/postgres/usage/5-adding-items.sql?raw'
import pgScratchpad from './queries/postgres/usage/7-scratchpad.sql?raw'

/** The Postgres versions, by the SQLite file they replace (only where the two differ). */
const POSTGRES: Record<string, string> = {
  '1-rep-scorecard.sql': pgRepScorecard,
  '2-store-comparison.sql': pgStoreComparison,
  '5-attach-trend.sql': pgAttachTrend,
  '6-premium-share.sql': pgPremiumShare,
  '7-exceptions.sql': pgExceptions,
  'usage/1-company-by-month.sql': pgCompanyByMonth,
  'usage/2-stores-by-week.sql': pgStoresByWeek,
  'usage/3-coverage-by-rep.sql': pgCoverageByRep,
  'usage/5-adding-items.sql': pgAddingItems,
  'usage/7-scratchpad.sql': pgScratchpad,
}

export interface Report {
  id: string
  title: string
  question: string
  /** The query file, under src/db/queries, for the "Show the SQL" view and the SQL guide. */
  file: string
  sql: string
}

export const REPORTS: Report[] = [
  {
    id: 'rep-scorecard',
    title: 'Rep scorecard by month',
    question: 'How did each rep do each month: ups, conversion, sales, margin, attach and commission?',
    file: '1-rep-scorecard.sql',
    sql: repScorecard,
  },
  {
    id: 'store-comparison',
    title: 'Store comparison',
    question: 'How do the two stores compare over the whole period?',
    file: '2-store-comparison.sql',
    sql: storeComparison,
  },
  {
    id: 'tier-mix',
    title: 'Tier mix by rep',
    question: "How much of each rep's business lands in each commission tier?",
    file: '3-tier-mix.sql',
    sql: tierMix,
  },
  {
    id: 'where-deals-close',
    title: 'Where deals close on the ladder',
    question: 'At which offer do customers say yes, and what does each step cost?',
    file: '4-where-deals-close.sql',
    sql: whereDealsClose,
  },
  {
    id: 'attach-trend',
    title: 'Adjustable-base attach by month',
    question: 'Is the share of sales with an adjustable base going up or down?',
    file: '5-attach-trend.sql',
    sql: attachTrend,
  },
  {
    id: 'premium-share',
    title: 'Premium line by rep',
    question: 'Who sells the price-locked premium line, and do they still make margin on it?',
    file: '6-premium-share.sql',
    sql: premiumShare,
  },
  {
    id: 'exceptions',
    title: 'Exceptions: low-margin sales',
    question: 'Who gives the most margin away: low-tier sales, and sales under the exceptions margin?',
    file: '7-exceptions.sql',
    sql: exceptions,
  },
]

/** The Usage tab (managers): how the app itself is used, from the events and traffic tables. */
export const USAGE_REPORTS: Report[] = [
  {
    id: 'usage-company-by-month',
    title: 'The company by month',
    question: 'How often do reps use the app with a customer, how many use it, and how many tickets end with an outcome?',
    file: 'usage/1-company-by-month.sql',
    sql: companyByMonth,
  },
  {
    id: 'usage-stores-by-week',
    title: 'Each store by week',
    question: "Week by week, how many of each store's reps use the app, and with how many of their customers?",
    file: 'usage/2-stores-by-week.sql',
    sql: storesByWeek,
  },
  {
    id: 'usage-coverage',
    title: 'Coverage by rep and month',
    question: 'Of the customers each rep helped, how many did they use the app with?',
    file: 'usage/3-coverage-by-rep.sql',
    sql: coverageByRep,
  },
  {
    id: 'usage-funnel',
    title: 'What happens to each ticket',
    question: 'Once a ticket is started, do reps try a price, record an offer and record how it ended?',
    file: 'usage/4-ticket-funnel.sql',
    sql: ticketFunnel,
  },
  {
    id: 'usage-adding-items',
    title: 'How items get on the ticket',
    question: 'Typed SKU, name search, Look up or Inventory: how does each rep add items, month by month?',
    file: 'usage/5-adding-items.sql',
    sql: addingItems,
  },
  {
    id: 'usage-price-changes',
    title: 'How prices get changed',
    question: 'New price, % off or $ off; one row, the whole ticket or delivery; and how often the store refuses a price.',
    file: 'usage/6-price-changes.sql',
    sql: priceChanges,
  },
  {
    id: 'usage-scratchpad',
    title: 'Scratchpad signals',
    question: 'Are reps trying prices without recording them? How fast do they get to a first price?',
    file: 'usage/7-scratchpad.sql',
    sql: scratchpad,
  },
  {
    id: 'usage-data-quality',
    title: 'Data quality',
    question: "How much of each rep's floor do the reports see, and how many walk-outs go unrecorded?",
    file: 'usage/8-data-quality.sql',
    sql: dataQuality,
  },
]

/**
 * The Deal patterns tab (managers only): what happens with customers depending on
 * what's offered. Patterns, not proof; the screen says so.
 */
export const PATTERN_REPORTS: Report[] = [
  {
    id: 'patterns-discount-size',
    title: 'Offers accepted by discount size',
    question: 'How often does a customer say yes to an offer, depending on how far below the asking price it is?',
    file: 'patterns/1-discount-size.sql',
    sql: discountSize,
  },
  {
    id: 'patterns-base-discount',
    title: 'Offers accepted by base discount',
    question: 'Does taking more off the adjustable base get more yeses, and where does more stop helping?',
    file: 'patterns/2-base-discount.sql',
    sql: baseDiscount,
  },
  {
    id: 'patterns-free-delivery',
    title: 'Offers accepted by delivery',
    question: 'Does free delivery get more yeses, and does it matter more on a big ticket?',
    file: 'patterns/3-free-delivery.sql',
    sql: freeDelivery,
  },
  {
    id: 'patterns-financing',
    title: 'Close rate by financing term',
    question: 'Do customers on financing buy more often, and does the term matter?',
    file: 'patterns/4-financing.sql',
    sql: financing,
  },
  {
    id: 'patterns-second-offers',
    title: 'What changed after a "no"',
    question: 'After a customer turned down the first offer, what was different for those who then bought?',
    file: 'patterns/5-second-offers.sql',
    sql: secondOffers,
  },
  {
    id: 'patterns-commission-given-up',
    title: 'Commission given up to discounting',
    question: 'How much commission does each rep give up by discounting, compared with the asking price?',
    file: 'patterns/6-commission-given-up.sql',
    sql: commissionGivenUp,
  },
  {
    id: 'patterns-offered-vs-sold',
    title: 'Offered vs sold, by product type',
    question: 'Which kinds of products get onto tickets but not bought, and how much are they discounted when they sell?',
    file: 'patterns/7-offered-vs-sold.sql',
    sql: offeredVsSold,
  },
]

/** Every built-in query, for looking one up by id. */
export const ALL_REPORTS: Report[] = [...REPORTS, ...USAGE_REPORTS, ...PATTERN_REPORTS]

/** Which file Postgres runs for a report: its own version, or the same file as SQLite. */
export function postgresFile(report: Report): string {
  return report.file in POSTGRES ? `postgres/${report.file}` : report.file
}

/** The SQL Postgres runs for a report. */
export function postgresSql(report: Report): string {
  return POSTGRES[report.file] ?? report.sql
}
