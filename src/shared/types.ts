export type Locale = 'ru' | 'vi';
export type DataStatus = 'verifiedSite' | 'demoInput' | 'userCreatedDemo' | 'demoAvailability' | 'demoPromo' | 'demoOverride';
export type BookingFormat = 'group' | 'private';
export type SourceChannel = 'Telegram' | 'Сайт' | 'Реклама' | 'Другие каналы';
export type OrderStatus = 'Новый' | 'Оплачено' | 'Подтверждено';
export type PaymentChoice = 'deposit' | 'full';
export type PaymentMethod = 'card' | 'sbp' | 'kaspi' | 'vnpay' | 'transfer' | 'cash' | 'other';
export type PromoDiscountType = 'none' | 'percent_bps' | 'fixed_minor';
export type GroupDepartureStatus = 'gathering' | 'confirmed' | 'cancelled' | 'completed';

export interface ChildRule {
  type: 'height' | 'age';
  min?: number;
  max?: number;
  priceMinor: number;
  label: string;
}

export interface PrivatePriceTier {
  minPeople: number;
  maxPeople: number;
  totalMinor?: number;
  perPersonMinor?: number;
}

export interface PricingRules {
  adultMinor?: number;
  adultFromMinor?: number;
  childRules: ChildRule[];
  privateTiers?: PrivatePriceTier[];
  note?: string;
}

export interface TourPromo {
  enabled: boolean;
  label: string;
  value: string;
  discountType?: PromoDiscountType;
  discountValue?: number;
  dataStatus?: DataStatus;
}

export interface Tour {
  id: string;
  slug: string;
  title: string;
  direction: string;
  category: string;
  published: boolean;
  sourceUrl: string;
  priceMode: 'fixed' | 'from-price' | 'dynamic-request';
  pricingRules: PricingRules;
  requiredFields: string[];
  scheduleMode: 'demoDates' | 'request';
  pickup?: string;
  back?: string;
  description: string;
  program: string[];
  included: string[];
  extraCosts: string[];
  whatToTake: string[];
  images: string[];
  badges: string[];
  dataStatus: DataStatus;
  createdAt?: string;
  updatedAt?: string;
  promo?: TourPromo;
}

export interface Destination {
  id: string;
  name: string;
  dataStatus: DataStatus;
}

export interface AvailabilityDate {
  date: string;
  status: 'available' | 'low' | 'request';
  label: string;
  dataStatus: 'demoAvailability';
}

export interface BookingChildInput {
  height?: number | null;
  age?: number | null;
}

export interface ParticipantInput {
  fullName: string;
  birthDate?: string;
  passport?: string;
}

export interface ContactInput {
  name: string;
  phone?: string;
  telegram?: string;
}

export interface BookingDraft {
  tourId: string;
  format: BookingFormat;
  date: string;
  adults: number;
  children: BookingChildInput[];
  hotel: string;
  transferZoneId?: string;
  participants: ParticipantInput[];
  contact: ContactInput;
  paymentChoice: PaymentChoice;
  paymentMethod: PaymentMethod;
  source: SourceChannel;
}

export interface QuoteLine {
  label: string;
  amountMinor: number;
}

export interface Quote {
  tourId: string;
  tourTitle: string;
  tourSubtotalMinor: number;
  transferMinor: number;
  discountMinor: number;
  totalMinor: number;
  depositPercentDemo: number;
  payNowMinor: number;
  remainingMinor: number;
  lines: QuoteLine[];
  transferLabel: string;
  promoLabel?: string;
  demo: true;
}

export interface OrderSummary {
  id: string;
  tourId: string;
  tourTitle: string;
  selectedDate: string;
  participantsSummary: string;
  hotel: string;
  transferMinor: number;
  totalMinor: number;
  paidMinor: number;
  remainingMinor: number;
  paymentState: string;
  status: OrderStatus;
  source: SourceChannel;
  customer: string;
  contact: string;
  createdAt: string;
  dataStatus: 'demoInput';
  children?: BookingChildInput[];
  participantData?: ParticipantInput[];
}

export interface GroupMemberInput {
  customerName: string;
  phone?: string;
  telegram?: string;
  adults: number;
  children: BookingChildInput[];
}

export interface GroupDepartureSummary {
  id: string;
  tourId: string;
  tourTitle: string;
  departureDate: string;
  status: GroupDepartureStatus;
  targetPeople: number | null;
  minPeople: number | null;
  seats: number;
  members: number;
  cancellationReason: string;
  dataStatus: 'demoInput';
  createdAt: string;
}

export interface AnalyticsResponse {
  metrics: {
    views: number;
    started: number;
    orders: number;
    paid: number;
    revenueMinor: number;
    conversion: number;
    averageOrderMinor: number;
  };
  sources: Array<{ source: string; views: number; started: number; orders: number; paid: number; revenueMinor: number }>;
  tours: Array<{ tourId: string; title: string; views: number; started: number; orders: number; paid: number; revenueMinor: number }>;
  funnel: Array<{ stage: string; value: number }>;
  orders: Array<{ source: string; tour: string; orderStatus: string; paymentStatus: string; amountMinor: number }>;
  demo: true;
}
