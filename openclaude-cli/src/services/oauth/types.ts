export type SubscriptionType =
  | 'free'
  | 'pro'
  | 'max'
  | 'team'
  | 'enterprise'
  | string

export type RateLimitTier = string

export type BillingType = string

export type OAuthProfileResponse = {
  account: {
    uuid: string
    email: string
    display_name?: string | null
    created_at?: string
    [key: string]: unknown
  }
  organization: {
    uuid: string
    has_extra_usage_enabled?: boolean | null
    billing_type?: BillingType | null
    subscription_created_at?: string
    organization_type?: string | null
    rate_limit_tier?: RateLimitTier | null
    [key: string]: unknown
  }
  subscription_type?: SubscriptionType | null
  rate_limit_tier?: RateLimitTier | null
  billing_type?: BillingType | null
  has_extra_usage_enabled?: boolean
  account_created_at?: string
  subscription_created_at?: string
  [key: string]: unknown
}

export type OAuthTokenExchangeResponse = {
  access_token: string
  refresh_token: string
  expires_in: number
  scope?: string
  account?: {
    uuid: string
    email_address: string
  }
  organization?: {
    uuid: string
  }
}

export type OAuthTokens = {
  accessToken: string
  refreshToken: string
  expiresAt: number
  scopes: string[]
  subscriptionType: SubscriptionType | null
  rateLimitTier: RateLimitTier | null
  profile?: OAuthProfileResponse
  tokenAccount?: {
    uuid: string
    emailAddress: string
    organizationUuid?: string
  }
}

export type UserRolesResponse = {
  organizations?: Array<{
    uuid: string
    role?: string | null
  }>
  [key: string]: unknown
}

export type ReferralCampaign = 'claude_code_guest_pass' | string

export type ReferrerRewardInfo = {
  amount_minor_units: number
  currency: string
  [key: string]: unknown
}

export type ReferralEligibilityResponse = {
  eligible: boolean
  remaining_passes?: number
  referral_code_details?: {
    referral_link?: string
    campaign?: string
    [key: string]: unknown
  }
  referrer_reward?: ReferrerRewardInfo | null
  [key: string]: unknown
}

export type ReferralRedemptionsResponse = {
  redemptions?: unknown[]
  limit?: number
  [key: string]: unknown
}
