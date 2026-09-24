import { z } from 'zod';

export const bookingChildSchema = z.object({
  height: z.number().min(0).max(250).nullable().optional(),
  age: z.number().min(0).max(120).nullable().optional(),
});

export const participantSchema = z.object({
  fullName: z.string().trim().min(2),
  birthDate: z.iso.date().optional().or(z.literal('')),
  passport: z.string().trim().max(120).optional(),
});

export const bookingDraftSchema = z.object({
  tourId: z.string().min(1),
  format: z.enum(['group', 'private']),
  date: z.iso.date(),
  adults: z.number().int().min(1).max(30),
  children: z.array(bookingChildSchema).max(20),
  hotel: z.string().trim().min(1).max(180),
  transferZoneId: z.string().max(80).optional(),
  participants: z.array(participantSchema).max(50),
  contact: z.object({
    name: z.string().trim().min(2).max(160),
    phone: z.string().trim().max(40).optional(),
    telegram: z.string().trim().max(80).optional(),
  }).refine((value) => Boolean(value.phone || value.telegram), {
    message: 'Укажите телефон или Telegram',
  }),
  paymentChoice: z.enum(['deposit', 'full']),
  paymentMethod: z.enum(['card', 'sbp', 'kaspi', 'vnpay', 'transfer', 'cash', 'other']),
  source: z.enum(['Telegram', 'Сайт', 'Реклама', 'Другие каналы']),
});

export const groupMemberSchema = z.object({
  customerName: z.string().trim().min(2).max(160),
  phone: z.string().trim().max(40).optional(),
  telegram: z.string().trim().max(80).optional(),
  adults: z.number().int().min(1).max(20),
  children: z.array(bookingChildSchema).max(20),
}).refine((value) => Boolean(value.phone || value.telegram), {
  message: 'Укажите телефон или Telegram',
});

export const createGroupDepartureSchema = z.object({
  tourId: z.string().min(1),
  departureDate: z.iso.date(),
  targetPeople: z.number().int().min(2).max(40).nullable().optional(),
  member: groupMemberSchema,
});

export const joinGroupDepartureSchema = z.object({
  member: groupMemberSchema,
});

export const groupDepartureAdminSchema = z.object({
  status: z.enum(['gathering', 'confirmed', 'cancelled', 'completed']),
  cancellationReason: z.string().trim().max(500).optional().default(''),
});

export const managerStatusSchema = z.object({
  status: z.enum(['Новый', 'Оплачено', 'Подтверждено'])
});

const adminChildRuleSchema = z.object({
  type: z.enum(['height', 'age']),
  min: z.number().min(0).max(500).optional(),
  max: z.number().min(0).max(500).optional(),
  priceMinor: z.number().int().min(0),
  label: z.string().trim().max(240),
});

const adminPrivatePriceTierSchema = z.object({
  minPeople: z.number().int().min(1).max(100),
  maxPeople: z.number().int().min(1).max(100),
  totalMinor: z.number().int().min(0).optional(),
  perPersonMinor: z.number().int().min(0).optional(),
});

const adminPricingRulesPatchSchema = z.object({
  adultMinor: z.number().int().min(0).nullable().optional(),
  adultFromMinor: z.number().int().min(0).nullable().optional(),
  childRules: z.array(adminChildRuleSchema).max(50).optional(),
  privateTiers: z.array(adminPrivatePriceTierSchema).max(50).optional(),
  note: z.string().max(1000).optional(),
});

const adminTextListSchema = z.array(z.string().trim().max(2000)).max(200);

export const adminTourPatchSchema = z.object({
  title: z.string().trim().min(2).max(300).optional(),
  direction: z.string().trim().min(1).max(160).optional(),
  category: z.string().trim().min(1).max(160).optional(),
  sourceUrl: z.string().trim().max(2000).optional(),
  priceMode: z.enum(['fixed', 'from-price', 'dynamic-request']).optional(),
  pricingRules: adminPricingRulesPatchSchema.optional(),
  description: z.string().max(20_000).optional(),
  adultMinor: z.number().int().min(0).optional(),
  published: z.boolean().optional(),
  requiredFields: z.array(z.string().trim().min(1).max(120)).max(80).optional(),
  scheduleMode: z.enum(['demoDates', 'request']).optional(),
  pickup: z.string().max(1000).optional(),
  back: z.string().max(1000).optional(),
  program: adminTextListSchema.optional(),
  included: adminTextListSchema.optional(),
  extraCosts: adminTextListSchema.optional(),
  whatToTake: adminTextListSchema.optional(),
  images: z.array(z.string().trim().min(1).max(4000)).max(100).optional(),
  badges: z.array(z.string().trim().max(240)).max(100).optional(),
});

export const addTourSchema = z.object({
  direction: z.string().trim().min(2),
  title: z.string().trim().min(2),
  description: z.string().default(''),
  priceMode: z.enum(['fixed', 'from-price', 'dynamic-request']),
  adultMinor: z.number().int().min(0),
  scheduleMode: z.enum(['demoDates', 'request']),
  images: z.array(z.string()).default([]),
  published: z.boolean().default(false),
});

export const availabilitySchema = z.object({
  date: z.iso.date(),
  status: z.enum(['available', 'low', 'request']),
});

export const promoSchema = z.object({
  enabled: z.boolean().default(false),
  label: z.string().trim().max(80).default(''),
  value: z.string().trim().max(80).default(''),
  discountType: z.enum(['none', 'percent_bps', 'fixed_minor']).default('none'),
  discountValue: z.number().int().min(0).default(0),
}).superRefine((value, ctx) => {
  if (value.discountType === 'percent_bps' && value.discountValue > 10_000) {
    ctx.addIssue({ code: 'custom', message: 'Процент скидки не может превышать 100%' });
  }
});
