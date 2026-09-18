export type PlanningCoordinates = Readonly<{ latitude: number; longitude: number }>;
export type PlanningStart = PlanningCoordinates & Readonly<{ label: string }>;

/** Dependency-free response place shape. Mobile's PricedNearbyPlace is structurally compatible. */
export type PricedNearbyPlace = Readonly<{
  place_id: string;
  name: string;
  category_code: string | null;
  category_name: string | null;
  address?: string | null;
  city?: string | null;
  region?: string | null;
  country_code?: string | null;
  latitude: number;
  longitude: number;
  distance_meters?: number | null;
  website_url?: string | null;
  phone_number?: string | null;
  has_price: boolean;
  pricing_basis?: string | null;
  pricing_status?: string | null;
  pricing_unit?: string | null;
  min_amount_minor?: number | null;
  max_amount_minor?: number | null;
  currency_code?: string | null;
  confidence_level?: string | null;
  price_precision?: string | null;
  pricing_channel?: string | null;
  price_source_label?: string | null;
  last_verified_at?: string | null;
  effective_price_source?: string | null;
  budget_status?: string | null;
  estimated_group_min_minor: number | null;
  estimated_group_max_minor: number | null;
  google_place_id?: string | null;
  google_match_status?: string;
  google_match_confidence?: number | null;
  chain_id?: string | null;
}>;

export type ItineraryStageSource = 'wise' | 'user_added';
export type ItineraryStage = Readonly<{
  id: string;
  title: string;
  categoryCodes: readonly string[];
  required: boolean;
  source: ItineraryStageSource;
  selectionConstraint?: string;
}>;

export type ItineraryStop<TPlace extends PricedNearbyPlace = PricedNearbyPlace> = Readonly<{ stageId: string; place: TPlace }>;
export type ItineraryState<TPlace extends PricedNearbyPlace = PricedNearbyPlace> = Readonly<{
  start: PlanningStart;
  budgetMinor: number;
  partySize: number;
  currencyCode?: string;
  stages: readonly ItineraryStage[];
  stops: readonly ItineraryStop<TPlace>[];
  finalized?: boolean;
}>;

export type PlanningProposalState = ItineraryState<PricedNearbyPlace>;
export type PlanningPlace = PricedNearbyPlace;
export type PlanningItineraryStage = ItineraryStage;
export type PlanningItineraryStop<TPlace extends PricedNearbyPlace = PricedNearbyPlace> = ItineraryStop<TPlace>;
export type PlanningItineraryState<TPlace extends PricedNearbyPlace = PricedNearbyPlace> = ItineraryState<TPlace>;
