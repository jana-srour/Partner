import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { canManageTeam } from '@/lib/team-permissions';

export async function POST(request: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const authorization = request.headers.get('authorization');

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return NextResponse.json({ error: 'Server configuration error.' }, { status: 500 });
    }

    if (!authorization?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const authClient = createClient(supabaseUrl, anonKey);
    const { data: authData, error: authError } = await authClient.auth.getUser(
      authorization.slice(7)
    );
    if (authError || !authData.user) {
      return NextResponse.json({ error: 'Invalid or expired session.' }, { status: 401 });
    }

    const body = await request.json() as {
      restaurantId?: string;
      memberUserId?: string;
      branchId?: string;
    };
    const restaurantId = body.restaurantId?.trim();
    const memberUserId = body.memberUserId?.trim();
    const branchId = body.branchId?.trim();

    if (!restaurantId || !memberUserId || !branchId) {
      return NextResponse.json({ error: 'Restaurant, member, and branch are required.' }, { status: 400 });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: requester } = await admin
      .from('restaurant_members')
      .select('user_id')
      .eq('restaurant_id', restaurantId)
      .eq('user_id', authData.user.id)
      .maybeSingle();

    if (!requester || !await canManageTeam(admin, authData.user.id, restaurantId)) {
      return NextResponse.json({ error: 'You do not have permission to manage team members.' }, { status: 403 });
    }

    const { data: target } = await admin
      .from('restaurant_members')
      .select('role')
      .eq('restaurant_id', restaurantId)
      .eq('user_id', memberUserId)
      .maybeSingle();

    if (!target) {
      return NextResponse.json({ error: 'Team member not found.' }, { status: 404 });
    }

    if (target.role?.toLowerCase().trim() === 'owner') {
      return NextResponse.json({ error: 'The restaurant owner always has access to all branches.' }, { status: 403 });
    }

    const { data: branch } = await admin
      .from('restaurant_branches')
      .select('id, name')
      .eq('id', branchId)
      .eq('restaurant_id', restaurantId)
      .eq('is_active', true)
      .maybeSingle();

    if (!branch) {
      return NextResponse.json({ error: 'Select an active branch belonging to this restaurant.' }, { status: 400 });
    }

    const { error } = await admin
      .from('restaurant_members')
      .update({ branch_id: branch.id })
      .eq('restaurant_id', restaurantId)
      .eq('user_id', memberUserId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, branchId: branch.id, branchName: branch.name });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error.' },
      { status: 500 }
    );
  }
}
