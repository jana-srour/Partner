import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Server configuration error.' }, { status: 500 });
  }

  try {
    const { slug } = await context.params;
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: restaurant, error: restaurantError } = await admin
      .from('restaurants')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();

    if (restaurantError || !restaurant) {
      return NextResponse.json({ error: 'Restaurant not found.' }, { status: 404 });
    }

    const { data: branches, error } = await admin
      .from('restaurant_branches')
      .select('id, name, code, is_main, latitude, longitude')
      .eq('restaurant_id', restaurant.id)
      .eq('is_active', true)
      .order('is_main', { ascending: false })
      .order('name', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ branches: branches || [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to load branches.' },
      { status: 500 },
    );
  }
}
