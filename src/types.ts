export interface LandlordRating {
  onTimePayment: boolean;
  paymentScore: number; // 100%
  propertyCareScore: number; // 1-5
  neighbourhoodRelationsScore: number; // 1-5
  depositReturnedFull: boolean;
  wouldRentAgain: boolean;
  comment?: string;
  verifiedAt: string;
  landlordName: string;
  landlordType: 'particulier' | 'agence' | 'gestionnaire';
  verificationMethod: 'email_token' | 'phone_code' | 'digital_signature';
}

export type LeaseStatus = 
  | 'draft' 
  | 'uploading' 
  | 'extracted' 
  | 'needs_review' 
  | 'pending' 
  | 'verified' 
  | 'rejected' 
  | 'disputed';

export interface RentalLease {
  id: string;
  code?: string;
  address: string;
  city: string;
  postalCode: string;
  country: string;
  countryCode: string;
  flag: string;
  propertyType: 'Studio' | 'Appartement T2' | 'Appartement T3' | 'Maison' | 'Colocation' | string;
  isFurnished: boolean;
  monthlyRent: number;
  deposit?: number;
  currency: string;
  startDate: string; // YYYY-MM
  endDate: string; // YYYY-MM or 'En cours' / 'Actual'
  isCurrent: boolean;
  monthsCount: number;
  status: LeaseStatus;
  verificationToken?: string;
  landlordEmail: string;
  landlordPhone?: string;
  landlordName: string;
  landlordRating?: LandlordRating;
  certificateHash?: string;
  contractPhotoUrl?: string;
  contractPagesCount?: number;
  confidenceScore?: number;
}

export interface ExtractedContractData {
  address?: string;
  city?: string;
  postalCode?: string;
  country?: string;
  rent?: number;
  deposit?: number;
  currency?: string;
  startDate?: string;
  endDate?: string;
  isCurrent?: boolean;
  landlordName?: string;
  landlordContact?: string;
  tenantName?: string;
  propertyType?: string;
  confidence?: {
    address?: number;
    rent?: number;
    dates?: number;
    landlord?: number;
    overall?: number;
  };
  rawSummary?: string;
}

export interface ContractFilePage {
  id: string;
  dataUrl: string;
  file?: File;
  name: string;
  size: number;
  type: string;
}

export interface PaymentRecord {
  id: string;
  leaseId: string;
  leaseAddress?: string;
  amount: number;
  currency: string;
  dueDate: string;
  paidDate?: string;
  status: 'paid_on_time' | 'paid_late' | 'pending' | 'unpaid';
  receiptUrl?: string;
}

export interface TenantProfile {
  id: string;
  passportId: string;
  passportNumber: string;
  mrzCode: string;
  fullName: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  birthDate: string;
  nationality: string;
  countryFlag: string;
  profession: string;
  avatarUrl: string;
  memberSince: string;
  trustScore: number;
  trustGrade: string;
  verifiedLeasesCount: number;
  totalMonthsVerified: number;
  onTimePaymentRate: number;
  fullDepositReturnRate: number;
  zeroDisputeBadge: boolean;
  internationalPortable: boolean;
  rentiaPoints?: number;
  stats: {
    trustScore: number;
    onTimePaymentRate: number;
    depositReturnedRate: number;
    verifiedLandlordsCount: number;
    totalMonths: number;
    zeroDisputes: boolean;
  };
}

export type RentiaPointsAction = 
  | 'LEASE_CONFIRMED'
  | 'IDENTITY_VERIFIED'
  | 'NOMINA_VERIFIED'
  | 'PROFILE_COMPLETED'
  | 'PAYMENT_RECORDED'
  | 'MAINTENANCE_RECORDED'
  | 'MATCH_INTERACTION';

export interface RentiaPointsEvent {
  id: string;
  user_id: string;
  action_type: RentiaPointsAction;
  points_delta: number;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface Listing {
  id: string;
  landlord_id: string;
  title: string;
  description?: string;
  city: string;
  neighborhood?: string;
  address?: string;
  rent: number;
  deposit?: number;
  currency: string;
  property_type: 'apartment' | 'studio' | 'house' | 'room';
  rooms_count: number;
  available_from: string;
  pets_allowed: boolean;
  furnished: boolean;
  min_income_required?: number;
  images: string[];
  is_active: boolean;
  created_at: string;
}

export interface TenantPreferences {
  id: string;
  tenant_id: string;
  target_city: string;
  max_budget: number;
  move_in_date: string;
  occupants_count: number;
  has_pets: boolean;
}

export interface MatchScoreBreakdown {
  compatibility: number; // 0 to 70
  verification: number; // 0 to 20
  activity: number; // 0 to 5
  pointsBonus: number; // 0 to 5 (capped)
  totalRawPoints: number;
}

export interface MatchResult {
  id: string;
  listing_id: string;
  tenant_id: string;
  landlord_id: string;
  status: 'active' | 'archived' | 'closed';
  landlord_first_message_sent: boolean;
  compatibility_score: number;
  created_at: string;
  listing?: Listing;
  tenant?: {
    id: string;
    name: string;
    avatar_url?: string;
    trust_score?: number;
  };
  landlord?: {
    id: string;
    name: string;
    avatar_url?: string;
  };
}

export interface ChatMessage {
  id: string;
  match_id: string;
  sender_id: string;
  sender_role: 'tenant' | 'landlord';
  sender_name?: string;
  content: string;
  created_at: string;
  read_at?: string;
}

export type ViewMode = 'tenant_passport' | 'landlord_verify_flow' | 'landlord_public_view' | 'certificate_export' | 'matching_discovery' | 'landlord_listings' | 'matches_chat';

