const { roundMoney } = require('../../common/utils/money');

function pairKey(employeeId, siteId) {
  return `${String(employeeId)}|${String(siteId)}`;
}

function localReceiveOf(expense) {
  return roundMoney((Number(expense.cashGiven) || 0) - (Number(expense.returnAmount) || 0));
}

function allocateBalances(impressDocs, localDocs) {
  const queues = new Map();
  for (const expense of localDocs) {
    const key = pairKey(expense.employee, expense.site);
    const list = queues.get(key) || [];
    list.push({ remaining: Math.max(localReceiveOf(expense), 0) });
    queues.set(key, list);
  }

  const byId = new Map();
  const sorted = [...impressDocs].sort((left, right) => {
    const byDate = new Date(left.date) - new Date(right.date);
    if (byDate !== 0) return byDate;
    return String(left._id || left.id) < String(right._id || right.id) ? -1 : 1;
  });

  for (const doc of sorted) {
    const given = roundMoney(doc.given);
    let receive = 0;
    let leftover = given;
    const queue = queues.get(pairKey(doc.employee, doc.site)) || [];
    for (const item of queue) {
      if (leftover <= 0) break;
      const take = Math.min(item.remaining, leftover);
      item.remaining = roundMoney(item.remaining - take);
      leftover = roundMoney(leftover - take);
      receive = roundMoney(receive + take);
    }
    byId.set(String(doc._id || doc.id), {
      localReceiveAmount: receive,
      broughtAmount: roundMoney(given - receive),
    });
  }

  const lastByPair = new Map();
  for (const doc of sorted) {
    lastByPair.set(pairKey(doc.employee, doc.site), String(doc._id || doc.id));
  }
  for (const [key, queue] of queues.entries()) {
    const leftoverReceive = roundMoney(queue.reduce((sum, item) => sum + item.remaining, 0));
    if (leftoverReceive <= 0) continue;
    const lastId = lastByPair.get(key);
    if (!lastId || !byId.has(lastId)) continue;
    const current = byId.get(lastId);
    current.localReceiveAmount = roundMoney(current.localReceiveAmount + leftoverReceive);
    current.broughtAmount = roundMoney(current.broughtAmount - leftoverReceive);
  }
  return byId;
}

function withBalance(row, balance) {
  const localReceiveAmount = balance ? balance.localReceiveAmount : 0;
  const broughtAmount = balance ? balance.broughtAmount : roundMoney(row.given);
  return {
    ...row,
    localReceiveAmount,
    broughtAmount,
    stillWithThem: broughtAmount,
  };
}

function balanceTotals(items) {
  const given = roundMoney(items.reduce((sum, row) => sum + Number(row.given || 0), 0));
  const localReceiveAmount = roundMoney(items.reduce((sum, row) => sum + Number(row.localReceiveAmount || 0), 0));
  const broughtAmount = roundMoney(given - localReceiveAmount);
  return {
    given,
    localReceiveAmount,
    broughtAmount,
    stillWithThem: broughtAmount,
  };
}

module.exports = { pairKey, localReceiveOf, allocateBalances, withBalance, balanceTotals };
