import { supabase } from '@/lib/supabase';

export type RestaurantBranchScope = {
  restaurantId: string;
  branchId: string | null;
  role: string;
};

export const UNASSIGNED_BRANCH_SCOPE_ID = '00000000-0000-0000-0000-000000000000';

export function isAllBranchOwner(scope: RestaurantBranchScope) {
  return scope.role === 'owner' && scope.branchId === null;
}

export async function getCurrentRestaurantBranchScope(): Promise<RestaurantBranchScope | null> {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return null;

  const { data: membership, error } = await supabase
    .from('restaurant_members')
    .select('restaurant_id, branch_id, role')
    .eq('user_id', auth.user.id)
    .limit(1)
    .maybeSingle();

  if (error || !membership?.restaurant_id) return null;

  return {
    restaurantId: membership.restaurant_id,
    branchId: membership.branch_id,
    role: String(membership.role || '').trim().toLowerCase(),
  };
}