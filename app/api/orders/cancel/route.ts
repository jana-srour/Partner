import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

function hashCode(code: string) {
  return createHash('sha256').update(code).digest('hex');
}

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const authorization = request.headers.get('authorization');

  if (!supabaseUrl || !serviceRoleKey || !anonKey || !authorization?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const authClient = createClient(supabaseUrl, anonKey);
  const { data: authData } = await authClient.auth.getUser(authorization.slice(7));
  const user = authData.user;
  if (!user) return NextResponse.json({ error: 'Invalid session.' }, { status: 401 });

  const body = await request.json() as { restaurantId?: string; orderId?: string; code?: string };
  if (!body.restaurantId || !body.orderId || !body.code?.trim()) {
    return NextResponse.json({ error: 'Restaurant, order, and cancellation code are required.' }, { status: 400 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: membership } = await admin
    .from('restaurant_members')
    .select('role')
    .eq('restaurant_id', body.restaurantId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!membership) return NextResponse.json({ error: 'You are not a member of this restaurant.' }, { status: 403 });

  const { data: restaurant } = await admin
    .from('restaurants')
    .select('order_cancellation_code_hash')
    .eq('id', body.restaurantId)
    .single();

  if (!restaurant?.order_cancellation_code_hash || hashCode(body.code.trim()) !== restaurant.order_cancellation_code_hash) {
    return NextResponse.json({ error: 'Incorrect cancellation code.' }, { status: 403 });
  }

  const { error } = await admin
    .from('orders')
    .update({ status: 'Cancelled', cancelled_at: new Date().toISOString(), cancelled_by: user.id, updated_at: new Date().toISOString() })
    .eq('id', body.orderId)
    .eq('restaurant_id', body.restaurantId)
    .neq('status', 'Cancelled');

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}
