import { describe, expect, it } from 'vitest';
import { evaluateMaxTourPolicy, refundAmountMinor } from '../src/worker/services/refund-policy';

describe('MAX TOUR refund and reschedule policy',()=>{
  it('allows free cancellation when the date is unambiguously more than 48 hours away',()=>{
    const d=evaluateMaxTourPolicy('2026-09-12','cancel',new Date('2026-09-09T05:00:00Z'));
    expect(d.retentionPercent).toBe(0);
    expect(d.ruleCode).toBe('FREE_CANCEL_GT_48H');
  });
  it('retains 30 percent inside the pre-departure cancellation window',()=>{
    const d=evaluateMaxTourPolicy('2026-09-11','cancel',new Date('2026-09-09T05:00:00Z'));
    expect(d.retentionPercent).toBe(30);
  });
  it('retains 100 percent on departure day and no-show',()=>{
    expect(evaluateMaxTourPolicy('2026-09-09','cancel',new Date('2026-09-09T05:00:00Z')).retentionPercent).toBe(100);
    expect(evaluateMaxTourPolicy('2026-09-12','no_show',new Date('2026-09-09T05:00:00Z')).retentionPercent).toBe(100);
  });
  it('allows reschedule before 17:00 previous day and retains 30 percent after cutoff',()=>{
    expect(evaluateMaxTourPolicy('2026-09-10','reschedule',new Date('2026-09-09T08:00:00Z')).retentionPercent).toBe(0); // 15:00 Vietnam
    expect(evaluateMaxTourPolicy('2026-09-10','reschedule',new Date('2026-09-09T11:00:00Z')).retentionPercent).toBe(30); // 18:00 Vietnam
  });
  it('applies retention to total trip value, not merely the amount already paid',()=>{
    expect(refundAmountMinor(10000,3000,30)).toBe(0);
    expect(refundAmountMinor(10000,10000,30)).toBe(7000);
    expect(refundAmountMinor(10000,3000,0)).toBe(3000);
  });
});
