import { api } from './actual';
import { Config } from './config';
import { logger } from './logger';

// The @actual-app/api types for getBudgetMonth.categoryGroups are Record<string, unknown>[].
// These interfaces reflect the actual runtime shape.
interface BudgetCategory {
  id: string;
  name: string;
  budgeted: number;
  spent: number;
  balance: number;
  carryover: boolean;
}

interface BudgetCategoryGroup {
  id: string;
  name: string;
  budgeted: number;
  spent: number;
  balance: number;
  categories: BudgetCategory[];
}

interface BudgetMonth {
  month: string;
  categoryGroups: BudgetCategoryGroup[];
}

type FAFOType = 'Fixed' | 'Flex' | 'Allowances' | 'Other';

const FAFO_GROUPS: FAFOType[] = ['Fixed', 'Flex', 'Allowances', 'Other'];

interface ReconciliationWindow {
  sourceMonth: string; // YYYY-MM — the month we read spending from
  targetMonth: string; // YYYY-MM — the month we set budgets for
}

/**
 * Determine whether today is within the reconciliation window and which
 * months are the source (spending data) and target (budget to set).
 *
 * Returns null if outside the window.
 */
export function getReconciliationWindow(
  now: Date,
  startDay: number,
  endDay: number,
): ReconciliationWindow | null {
  const day = now.getDate();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed

  if (day >= startDay) {
    // Late in the month — reconciling this month's spending for next month's budget
    const sourceMonth = formatMonth(year, month);
    const nextMonth = month === 11 ? 0 : month + 1;
    const nextYear = month === 11 ? year + 1 : year;
    const targetMonth = formatMonth(nextYear, nextMonth);
    return { sourceMonth, targetMonth };
  }

  if (day <= endDay) {
    // Early in the month — reconciling last month's spending for this month's budget
    const targetMonth = formatMonth(year, month);
    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;
    const sourceMonth = formatMonth(prevYear, prevMonth);
    return { sourceMonth, targetMonth };
  }

  return null;
}

function formatMonth(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

function findGroup(
  groups: BudgetCategoryGroup[],
  name: string,
): BudgetCategoryGroup | undefined {
  return groups.find((g) => g.name.toLowerCase() === name.toLowerCase());
}

function findOtherCategory(
  group: BudgetCategoryGroup,
  preferredName: string | null,
): BudgetCategory | undefined {
  if (preferredName) {
    const match = group.categories.find(
      (c) => c.name.toLowerCase() === preferredName.toLowerCase(),
    );
    if (match) return match;
    logger.warn(`Configured FAFO_OTHER_CATEGORY "${preferredName}" not found in Other group, falling back to first category`);
  }
  return group.categories[0];
}

async function setBudget(
  dryRun: boolean,
  month: string,
  categoryId: string,
  amount: number,
): Promise<void> {
  if (!dryRun) {
    await api.setBudgetAmount(month, categoryId, amount);
  }
}

export async function reconcile(config: Config): Promise<void> {
  const now = new Date();
  const window = getReconciliationWindow(
    now,
    config.fafo.reconStartDay,
    config.fafo.reconEndDay,
  );

  if (!window) {
    logger.info('Not in reconciliation window, skipping', {
      day: now.getDate(),
      startDay: config.fafo.reconStartDay,
      endDay: config.fafo.reconEndDay,
    });
    return;
  }

  logger.info('Starting FAFO reconciliation', {
    sourceMonth: window.sourceMonth,
    targetMonth: window.targetMonth,
    dryRun: config.fafo.dryRun,
  });

  // Sync to get latest data
  await api.sync();

  // Get budget data for both months
  const sourceBudget = (await api.getBudgetMonth(window.sourceMonth)) as unknown as BudgetMonth;
  const targetBudget = (await api.getBudgetMonth(window.targetMonth)) as unknown as BudgetMonth;

  const sourceGroups = sourceBudget.categoryGroups;
  const targetGroups = targetBudget.categoryGroups;

  // Validate all FAFO groups exist in both months
  for (const groupName of FAFO_GROUPS) {
    if (!findGroup(sourceGroups, groupName)) {
      throw new Error(
        `Category group "${groupName}" not found in source month. ` +
        `Found: ${sourceGroups.map((g) => g.name).join(', ')}`,
      );
    }
    if (!findGroup(targetGroups, groupName)) {
      throw new Error(
        `Category group "${groupName}" not found in target month. ` +
        `Found: ${targetGroups.map((g) => g.name).join(', ')}`,
      );
    }
  }

  const targetMonthlyAmount = Math.round(config.fafo.monthlyTarget * 100); // Actual uses integer cents

  // Step 1: Copy Fixed budgets from source month to target month
  const sourceFixedGroup = findGroup(sourceGroups, 'Fixed')!;
  const targetFixedGroup = findGroup(targetGroups, 'Fixed')!;
  let fixedTotal = 0;

  for (const sourceCat of sourceFixedGroup.categories) {
    const targetCat = targetFixedGroup.categories.find((c) => c.id === sourceCat.id);
    if (!targetCat) continue;

    const newBudget = sourceCat.budgeted;
    fixedTotal += newBudget;

    if (targetCat.budgeted !== newBudget) {
      logger.info(`Fixed: "${sourceCat.name}"`, { from: targetCat.budgeted / 100, to: newBudget / 100 });
      await setBudget(config.fafo.dryRun, window.targetMonth, sourceCat.id, newBudget);
    } else {
      logger.info(`Fixed: "${sourceCat.name}" unchanged at ${newBudget / 100}`);
    }
  }

  // Step 2: Copy Allowance budgets from source month to target month
  const sourceAllowancesGroup = findGroup(sourceGroups, 'Allowances')!;
  const targetAllowancesGroup = findGroup(targetGroups, 'Allowances')!;
  let allowancesTotal = 0;

  for (const sourceCat of sourceAllowancesGroup.categories) {
    const targetCat = targetAllowancesGroup.categories.find((c) => c.id === sourceCat.id);
    if (!targetCat) continue;

    const newBudget = sourceCat.budgeted;
    allowancesTotal += newBudget;

    if (targetCat.budgeted !== newBudget) {
      logger.info(`Allowances: "${sourceCat.name}"`, { from: targetCat.budgeted / 100, to: newBudget / 100 });
      await setBudget(config.fafo.dryRun, window.targetMonth, sourceCat.id, newBudget);
    } else {
      logger.info(`Allowances: "${sourceCat.name}" unchanged at ${newBudget / 100}`);
    }
  }

  // Step 3: Update source month's Flex budgets to match actual spending,
  // then copy the values to the target month.
  // Categories with carryover enabled keep their budget as-is (unspent amounts accumulate).
  const sourceFlexGroup = findGroup(sourceGroups, 'Flex')!;
  let flexTotal = 0;

  for (const sourceCat of sourceFlexGroup.categories) {
    let newBudget: number;

    if (sourceCat.carryover) {
      // Carryover enabled — keep the existing budget so unspent amounts accumulate
      newBudget = sourceCat.budgeted;
      logger.info(`Flex: "${sourceCat.name}" has carryover, keeping budget at ${newBudget / 100}`);
    } else {
      // No carryover — correct source month budget to match actual spending
      // (spent is negative in Actual, so we use abs value)
      newBudget = Math.abs(sourceCat.spent);

      if (sourceCat.budgeted !== newBudget) {
        logger.info(`Flex (${window.sourceMonth}): "${sourceCat.name}"`, {
          from: sourceCat.budgeted / 100,
          to: newBudget / 100,
          spent: sourceCat.spent / 100,
        });
        await setBudget(config.fafo.dryRun, window.sourceMonth, sourceCat.id, newBudget);
      }
    }

    flexTotal += newBudget;

    // Copy value to target month
    const targetCat = findGroup(targetGroups, 'Flex')!.categories.find((c) => c.id === sourceCat.id);
    if (!targetCat) {
      logger.warn(`Flex category "${sourceCat.name}" not found in target month, skipping`);
      continue;
    }

    if (targetCat.budgeted !== newBudget) {
      logger.info(`Flex (${window.targetMonth}): "${sourceCat.name}"`, {
        from: targetCat.budgeted / 100,
        to: newBudget / 100,
      });
      await setBudget(config.fafo.dryRun, window.targetMonth, sourceCat.id, newBudget);
    } else {
      logger.info(`Flex: "${sourceCat.name}" unchanged at ${newBudget / 100}`);
    }
  }

  // Step 4: Calculate Other = Target - Fixed - Flex - Allowances
  const otherBudget = targetMonthlyAmount - fixedTotal - flexTotal - allowancesTotal;

  if (otherBudget < 0) {
    logger.warn('Calculated Other budget is negative — spending exceeds target', {
      target: targetMonthlyAmount / 100,
      fixed: fixedTotal / 100,
      flex: flexTotal / 100,
      allowances: allowancesTotal / 100,
      other: otherBudget / 100,
    });
  }

  // Step 5: Assign Other budget to the catch-all category
  const targetOtherGroup = findGroup(targetGroups, 'Other')!;
  const otherCategory = findOtherCategory(targetOtherGroup, config.fafo.otherCategory);

  if (!otherCategory) {
    throw new Error('No categories found in the Other group');
  }

  if (otherCategory.budgeted !== otherBudget) {
    logger.info(`Other: "${otherCategory.name}"`, {
      from: otherCategory.budgeted / 100,
      to: otherBudget / 100,
    });
    await setBudget(config.fafo.dryRun, window.targetMonth, otherCategory.id, otherBudget);
  } else {
    logger.info(`Other: "${otherCategory.name}" unchanged at ${otherBudget / 100}`);
  }

  // Sync changes
  if (!config.fafo.dryRun) {
    await api.sync();
  }

  // Summary
  logger.info('Reconciliation complete', {
    targetMonth: window.targetMonth,
    target: targetMonthlyAmount / 100,
    fixed: fixedTotal / 100,
    flex: flexTotal / 100,
    allowances: allowancesTotal / 100,
    other: otherBudget / 100,
    dryRun: config.fafo.dryRun,
  });
}
