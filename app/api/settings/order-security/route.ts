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

  const body = await request.json() as { restaurantId?: string; code?: string };
  if (!body.restaurantId || (body.code !== undefined && body.code !== null && body.code.trim().length < 4)) {
    return NextResponse.json({ error: 'A cancellation code of at least 4 characters is required.' }, { status: 400 });
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

  if (membership?.role?.toLowerCase() !== 'owner') {
    return NextResponse.json({ error: 'Only the restaurant owner can change this code.' }, { status: 403 });
  }

  const code = body.code?.trim() || null;
  const { error } = await admin
    .from('restaurants')
    .update({
      order_cancellation_code: code,
      order_cancellation_code_hash: code ? hashCode(code) : null,
    })
    .eq('id', body.restaurantId);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true, configured: Boolean(code) });
}
