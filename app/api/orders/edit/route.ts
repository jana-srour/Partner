import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

function hashCode(code: string) {
  return createHash('sha256').update(code).digest('hex');
}

type EditableItem = {
  name?: string;
  quantity?: number;
  unitPrice?: number;
};

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

  const body = await request.json() as {
    restaurantId?: string;
    orderId?: string;
    code?: string;
    items?: EditableItem[];
  };

  if (!body.restaurantId || !body.orderId || !body.code?.trim() || !Array.isArray(body.items)) {
    return NextResponse.json({ error: 'Restaurant, order, code, and items are required.' }, { status: 400 });
  }

  const items = body.items.map((item) => ({
    name: String(item.name || '').trim(),
    quantity: Number(item.quantity),
    unitPrice: Number(item.unitPrice),
  }));

  if (items.some((item) => !item.name || !Number.isInteger(item.quantity) || item.quantity < 1 || !Number.isFinite(item.unitPrice) || item.unitPrice < 0)) {
    return NextResponse.json({ error: 'Each item needs a name, quantity, and valid price.' }, { status: 400 });
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

  const { data: order, error: orderError } = await admin
    .from('orders')
    .select('id, total, delivery_fee')
    .eq('id', body.orderId)
    .eq('restaurant_id', body.restaurantId)
    .single();

  if (orderError || !order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });

  const { error: deleteError } = await admin
    .from('order_items')
    .delete()
    .eq('order_id', body.orderId);

  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 400 });

  const { error: insertError } = await admin
    .from('order_items')
    .insert(items.map((item) => ({
      order_id: body.orderId,
      item_name: item.name,
      quantity: item.quantity,
      unit_price: item.unitPrice,
    })));

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 400 });

  const itemsTotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const nextTotal = itemsTotal + Number(order.delivery_fee || 0);
  const { error: updateError } = await admin
    .from('orders')
    .update({ total: nextTotal, updated_at: new Date().toISOString() })
    .eq('id', body.orderId)
    .eq('restaurant_id', body.restaurantId);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });
  return NextResponse.json({ success: true, total: nextTotal });
}
