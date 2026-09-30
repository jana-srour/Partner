'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  Check,
  ChevronDown,
  Clock3,
  Edit3,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Plus,
  Power,
  RefreshCw,
  Search,
  Star,
  Trash2,
  X,
} from 'lucide-react';

import { supabase } from '@/lib/supabase';

type Branch = {
  id: string;
  restaurant_id: string;
  name: string;
  code: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  email: string | null;
  opening_time: string | null;
  closing_time: string | null;
  is_active: boolean;
  is_main: boolean;
  created_at: string;
  updated_at: string;
};

type FormState = {
  name: string;
  code: string;
  address: string;
  latitude: string;
  longitude: string;
  phone: string;
  email: string;
  opening_time: string;
  closing_time: string;
  is_active: boolean;
  is_main: boolean;
};

const emptyForm: FormState = {
  name: '',
  code: '',
  address: '',
  latitude: '',
  longitude: '',
  phone: '',
  email: '',
  opening_time: '',
  closing_time: '',
  is_active: true,
  is_main: false,
};

function formatTime(value: string | null) {
  if (!value) return 'Not set';

  return value.slice(0, 5);
}

function normalizeTime(value: string) {
  if (!value) return null;

  if (/^\d{2}:\d{2}$/.test(value)) {
    return `${value}:00`;
  }

  return value;
}

export default function BranchesPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [restaurantId, setRestaurantId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [search, setSearch] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);

  const [form, setForm] = useState<FormState>(emptyForm);

  const [deleteConfirm, setDeleteConfirm] = useState<Branch | null>(null);

  // ----------------------------------------------------------
  // Load restaurant
  // ----------------------------------------------------------

  const loadRestaurant = async () => {
    setError(null);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      setError(userError.message);
      return null;
    }

    if (!user) {
      setError('You must be signed in.');
      return null;
    }

    const { data, error: memberError } = await supabase
      .from('restaurant_members')
      .select('restaurant_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();

    if (memberError) {
      setError(memberError.message);
      return null;
    }

    if (!data?.restaurant_id) {
      setError('No restaurant was found for your account.');
      return null;
    }

    setRestaurantId(data.restaurant_id);

    return data.restaurant_id;
  };

  // ----------------------------------------------------------
  // Load branches
  // ----------------------------------------------------------

  const loadBranches = async (id?: string | null) => {
    const rid = id ?? restaurantId;

    if (!rid) return;

    setLoading(true);
    setError(null);

    const { data, error: branchesError } = await supabase
        .from('restaurant_branches')
        .select(
        `
            id,
            restaurant_id,
            name,
            code,
            address,
            latitude,
            longitude,
            phone,
            email,
            opening_time,
            closing_time,
            is_active,
            is_main,
            created_at,
            updated_at
        `,
        )
        .eq('restaurant_id', rid)
        .order('is_main', { ascending: false })
        .order('name', { ascending: true });

    console.log('BRANCH LOAD:', {
        restaurantId: rid,
        data,
        error: branchesError,
    });

    if (branchesError) {
        setError(
        `Could not load branches: ${branchesError.message}`,
        );
        setBranches([]);
    } else {
        setBranches((data ?? []) as Branch[]);
    }

    setLoading(false);
    };

  // ----------------------------------------------------------
  // Initial load
  // ----------------------------------------------------------

  useEffect(() => {
    let mounted = true;

    const initialize = async () => {
      const rid = await loadRestaurant();

      if (!mounted || !rid) {
        setLoading(false);
        return;
      }

      await loadBranches(rid);
    };

    initialize();

    return () => {
      mounted = false;
    };
  }, []);

  // ----------------------------------------------------------
  // Realtime
  // ----------------------------------------------------------

  useEffect(() => {
    if (!restaurantId) return;

    const channel = supabase
      .channel(`partner-branches-${restaurantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'restaurant_branches',
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const branch = payload.new as Branch;

            setBranches((current) => {
              if (current.some((item) => item.id === branch.id)) {
                return current;
              }

              return [...current, branch].sort((a, b) => {
                if (a.is_main !== b.is_main) {
                  return a.is_main ? -1 : 1;
                }

                return a.name.localeCompare(b.name);
              });
            });

            return;
          }

          if (payload.eventType === 'UPDATE') {
            const branch = payload.new as Branch;

            setBranches((current) =>
              current
                .map((item) =>
                  item.id === branch.id ? branch : item,
                )
                .sort((a, b) => {
                  if (a.is_main !== b.is_main) {
                    return a.is_main ? -1 : 1;
                  }

                  return a.name.localeCompare(b.name);
                }),
            );

            return;
          }

          if (payload.eventType === 'DELETE') {
            const oldBranch = payload.old as Branch;

            setBranches((current) =>
              current.filter((item) => item.id !== oldBranch.id),
            );
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [restaurantId]);

  // ----------------------------------------------------------
  // Filter
  // ----------------------------------------------------------

  const filteredBranches = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return branches;

    return branches.filter((branch) => {
      return (
        branch.name.toLowerCase().includes(query) ||
        branch.code?.toLowerCase().includes(query) ||
        branch.address?.toLowerCase().includes(query) ||
        branch.phone?.toLowerCase().includes(query) ||
        branch.email?.toLowerCase().includes(query)
      );
    });
  }, [branches, search]);

  // ----------------------------------------------------------
  // Modal helpers
  // ----------------------------------------------------------

  const openCreate = () => {
    setEditingBranch(null);

    setForm({
      ...emptyForm,
      is_main: branches.length === 0,
    });

    setError(null);
    setNotice(null);
    setModalOpen(true);
  };

  const openEdit = (branch: Branch) => {
    setEditingBranch(branch);

    setForm({
      name: branch.name,
      code: branch.code ?? '',
      address: branch.address ?? '',
      latitude: branch.latitude === null ? '' : String(branch.latitude),
      longitude: branch.longitude === null ? '' : String(branch.longitude),
      phone: branch.phone ?? '',
      email: branch.email ?? '',
      opening_time: formatTime(branch.opening_time),
      closing_time: formatTime(branch.closing_time),
      is_active: branch.is_active,
      is_main: branch.is_main,
    });

    setError(null);
    setNotice(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;

    setModalOpen(false);
    setEditingBranch(null);
    setForm(emptyForm);
  };

  // ----------------------------------------------------------
  // Save
  // ----------------------------------------------------------

  const saveBranch = async () => {
    if (!restaurantId) {
        setError('Restaurant could not be identified.');
        return;
    }

    const name = form.name.trim();
    const code = form.code.trim().toUpperCase();

    if (!name) {
        setError('Branch name is required.');
        return;
    }

    const latitude = form.latitude.trim() ? Number(form.latitude) : null;
    const longitude = form.longitude.trim() ? Number(form.longitude) : null;
    if (
      (latitude === null) !== (longitude === null) ||
      (latitude !== null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) ||
      (longitude !== null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180))
    ) {
      setError('Enter both valid coordinates, or leave both fields empty.');
      return;
    }

    if (form.email.trim()) {
        const emailOk =
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
            form.email.trim(),
        );

        if (!emailOk) {
        setError('Please enter a valid email address.');
        return;
        }
    }

    setSaving(true);
    setError(null);
    setNotice(null);

    try {
        // ----------------------------------------------------------
        // Check branch code before creating/updating
        // ----------------------------------------------------------

        if (code) {
        let codeQuery = supabase
            .from('restaurant_branches')
            .select('id, name')
            .eq('restaurant_id', restaurantId)
            .eq('code', code)
            .limit(1);

        if (editingBranch) {
            codeQuery = codeQuery.neq(
            'id',
            editingBranch.id,
            );
        }

        const {
            data: existingCode,
            error: codeCheckError,
        } = await codeQuery.maybeSingle();

        if (codeCheckError) {
            throw new Error(
            `Could not verify branch code: ${codeCheckError.message}`,
            );
        }

        if (existingCode) {
            setError(
            `Branch code "${code}" already exists. Please use a different code.`,
            );
            setSaving(false);
            return;
        }
        }

        const payload = {
        restaurant_id: restaurantId,
        name,
        code: code || null,
        address: form.address.trim() || null,
        latitude,
        longitude,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        opening_time: normalizeTime(form.opening_time),
        closing_time: normalizeTime(form.closing_time),
        is_active: form.is_active,
        is_main: form.is_main,
        };

        // ----------------------------------------------------------
        // Update
        // ----------------------------------------------------------

        if (editingBranch) {
        const { error: updateError } = await supabase
            .from('restaurant_branches')
            .update(payload)
            .eq('id', editingBranch.id)
            .eq('restaurant_id', restaurantId);

        if (updateError) {
            // Database-level duplicate protection
            if (updateError.code === '23505') {
            setError(
                `Branch code "${code}" already exists. Please use a different code.`,
            );
            } else {
            setError(updateError.message);
            }

            setSaving(false);
            return;
        }

        setNotice('Branch updated successfully.');
        }

        // ----------------------------------------------------------
        // Create
        // ----------------------------------------------------------

        else {
        const { error: insertError } = await supabase
            .from('restaurant_branches')
            .insert(payload);

        if (insertError) {
            // Database-level duplicate protection
            if (insertError.code === '23505') {
            setError(
                `Branch code "${code}" already exists. Please use a different code.`,
            );
            } else {
            setError(insertError.message);
            }

            setSaving(false);
            return;
        }

        setNotice('Branch created successfully.');
        }

        // ----------------------------------------------------------
        // IMPORTANT:
        // Close modal and reload the actual database data.
        // ----------------------------------------------------------

        setModalOpen(false);
        setEditingBranch(null);
        setForm(emptyForm);

        await loadBranches(restaurantId);
    } catch (error) {
        console.error('Failed to save branch:', error);

        setError(
        error instanceof Error
            ? error.message
            : 'Failed to save branch.',
        );
    } finally {
        setSaving(false);
    }
    };

  // ----------------------------------------------------------
  // Toggle active
  // ----------------------------------------------------------

  const toggleActive = async (branch: Branch) => {
    setError(null);
    setNotice(null);

    const { error: updateError } = await supabase
      .from('restaurant_branches')
      .update({
        is_active: !branch.is_active,
      })
      .eq('id', branch.id)
      .eq('restaurant_id', restaurantId);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setNotice(
      branch.is_active
        ? `${branch.name} has been deactivated.`
        : `${branch.name} has been activated.`,
    );
  };

  // ----------------------------------------------------------
  // Set main
  // ----------------------------------------------------------

  const setMainBranch = async (branch: Branch) => {
    if (!restaurantId || branch.is_main) return;

    setError(null);
    setNotice(null);

    const { error: clearError } = await supabase
        .from('restaurant_branches')
        .update({
        is_main: false,
        })
        .eq('restaurant_id', restaurantId)
        .eq('is_main', true);

    if (clearError) {
        setError(clearError.message);
        return;
    }

    const { error: updateError } = await supabase
        .from('restaurant_branches')
        .update({
        is_main: true,
        })
        .eq('id', branch.id)
        .eq('restaurant_id', restaurantId);

    if (updateError) {
        setError(updateError.message);
        return;
    }

    setNotice(`${branch.name} is now the main branch.`);

    await loadBranches(restaurantId);
    };

  // ----------------------------------------------------------
  // Delete
  // ----------------------------------------------------------

  const deleteBranch = async () => {
    if (!deleteConfirm || !restaurantId) return;

    if (branches.length <= 1) {
      setError(
        'You cannot delete the only branch. Create another branch first.',
      );
      setDeleteConfirm(null);
      return;
    }

    if (deleteConfirm.is_main) {
      setError(
        'You cannot delete the main branch. Set another branch as main first.',
      );
      setDeleteConfirm(null);
      return;
    }

    setDeleting(deleteConfirm.id);
    setError(null);
    setNotice(null);

    const { error: deleteError } = await supabase
      .from('restaurant_branches')
      .delete()
      .eq('id', deleteConfirm.id)
      .eq('restaurant_id', restaurantId);

    if (deleteError) {
      setError(deleteError.message);
      setDeleting(null);
      return;
    }

    setNotice(`${deleteConfirm.name} was deleted.`);

    setDeleting(null);
    setDeleteConfirm(null);

    await loadBranches();
  };

  // ----------------------------------------------------------
  // Render
  // ----------------------------------------------------------

  return (
    <div className="min-h-full bg-[#f7f5f1] px-4 py-6 text-[#202534] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#202534] text-white shadow-sm">
                <Building2 size={20} />
              </div>

              <div>
                <h1 className="text-2xl font-bold tracking-tight">
                  Branches
                </h1>

                <p className="text-sm text-slate-500">
                  Manage your restaurant locations and branch settings.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => loadBranches()}
              disabled={loading}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw
                size={16}
                className={loading ? 'animate-spin' : ''}
              />
              Refresh
            </button>

            <button
              type="button"
              onClick={openCreate}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#536dfe] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#465de0]"
            >
              <Plus size={17} />
              Add branch
            </button>
          </div>
        </div>

        {/* Alerts */}
        {error && (
          <div className="mb-5 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <X size={18} className="mt-0.5 shrink-0" />
            <span>{error}</span>

            <button
              type="button"
              onClick={() => setError(null)}
              className="ml-auto"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {notice && (
          <div className="mb-5 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            <Check size={18} className="mt-0.5 shrink-0" />
            <span>{notice}</span>

            <button
              type="button"
              onClick={() => setNotice(null)}
              className="ml-auto"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* Search */}
        <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />

            <input
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="Search branches..."
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm outline-none transition focus:border-[#536dfe] focus:bg-white focus:ring-2 focus:ring-[#536dfe]/10"
            />
          </div>

          <div className="text-sm text-slate-500">
            {branches.length}{' '}
            {branches.length === 1 ? 'branch' : 'branches'}
          </div>
        </div>

        {/* Loading */}
        {loading ? (
          <div className="flex min-h-[300px] items-center justify-center rounded-2xl border border-slate-200 bg-white">
            <div className="flex items-center gap-3 text-sm text-slate-500">
              <Loader2 size={20} className="animate-spin" />
              Loading branches...
            </div>
          </div>
        ) : filteredBranches.length === 0 ? (
          /* Empty */
          <div className="flex min-h-[380px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#202534]/5 text-[#202534]">
              <Building2 size={28} />
            </div>

            <h2 className="text-lg font-bold">
              {search
                ? 'No branches found'
                : 'No branches yet'}
            </h2>

            <p className="mt-1 max-w-md text-sm text-slate-500">
              {search
                ? 'Try a different search term.'
                : 'Create your first branch to start managing multiple restaurant locations.'}
            </p>

            {!search && (
              <button
                type="button"
                onClick={openCreate}
                className="mt-5 inline-flex h-11 items-center gap-2 rounded-xl bg-[#536dfe] px-5 text-sm font-semibold text-white"
              >
                <Plus size={17} />
                Create first branch
              </button>
            )}
          </div>
        ) : (
          /* Branch cards */
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {filteredBranches.map((branch) => (
              <div
                key={branch.id}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
              >
                <div className="border-b border-slate-100 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#202534] text-white">
                        <Building2 size={19} />
                      </div>

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="truncate font-bold">
                            {branch.name}
                          </h2>

                          {branch.is_main && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700">
                              <Star size={11} />
                              Main
                            </span>
                          )}
                        </div>

                        {branch.code && (
                          <p className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-400">
                            {branch.code}
                          </p>
                        )}
                      </div>
                    </div>

                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                        branch.is_active
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {branch.is_active
                        ? 'Active'
                        : 'Inactive'}
                    </span>
                  </div>
                </div>

                <div className="space-y-3 p-5">
                  {branch.address && (
                    <div className="flex items-start gap-3 text-sm text-slate-600">
                      <MapPin
                        size={16}
                        className="mt-0.5 shrink-0 text-slate-400"
                      />
                      <span>{branch.address}</span>
                    </div>
                  )}

                  {branch.phone && (
                    <div className="flex items-center gap-3 text-sm text-slate-600">
                      <Phone
                        size={16}
                        className="shrink-0 text-slate-400"
                      />
                      <span>{branch.phone}</span>
                    </div>
                  )}

                  {branch.email && (
                    <div className="flex items-center gap-3 text-sm text-slate-600">
                      <Mail
                        size={16}
                        className="shrink-0 text-slate-400"
                      />
                      <span className="truncate">
                        {branch.email}
                      </span>
                    </div>
                  )}

                  {(branch.opening_time ||
                    branch.closing_time) && (
                    <div className="flex items-center gap-3 text-sm text-slate-600">
                      <Clock3
                        size={16}
                        className="shrink-0 text-slate-400"
                      />

                      <span>
                        {formatTime(branch.opening_time)}
                        {' — '}
                        {formatTime(branch.closing_time)}
                      </span>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => openEdit(branch)}
                    className="inline-flex h-11 items-center justify-center gap-2 border-r border-slate-100 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    <Edit3 size={15} />
                    Edit
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleActive(branch)}
                    className="inline-flex h-11 items-center justify-center gap-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    <Power size={15} />
                    {branch.is_active
                      ? 'Deactivate'
                      : 'Activate'}
                  </button>
                </div>

                <div className="flex border-t border-slate-100">
                  {!branch.is_main && (
                    <button
                      type="button"
                      onClick={() =>
                        setMainBranch(branch)
                      }
                      className="flex-1 border-r border-slate-100 py-3 text-xs font-semibold text-[#536dfe] transition hover:bg-[#536dfe]/5"
                    >
                      Set as main
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() =>
                      setDeleteConfirm(branch)
                    }
                    className={`${
                      branch.is_main
                        ? 'w-full'
                        : 'flex-1'
                    } py-3 text-xs font-semibold text-red-600 transition hover:bg-red-50`}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <Trash2 size={13} />
                      Delete
                    </span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* =====================================================
          CREATE / EDIT MODAL
          ===================================================== */}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#202534]/50 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-6 py-5">
              <div>
                <h2 className="text-lg font-bold">
                  {editingBranch
                    ? 'Edit branch'
                    : 'Add branch'}
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  {editingBranch
                    ? 'Update this branch information.'
                    : 'Add a new location to your restaurant.'}
                </p>
              </div>

              <button
                type="button"
                onClick={closeModal}
                disabled={saving}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={19} />
              </button>
            </div>

            <div className="space-y-5 p-6">
              {/* Name / Code */}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Branch name"
                  required
                  value={form.name}
                  onChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      name: value,
                    }))
                  }
                  placeholder="e.g. Hamra Branch"
                />

                <Field
                    label="Branch code"
                    value={form.code}
                    onChange={(value) =>
                        setForm((current) => ({
                        ...current,
                        code: value.toUpperCase(),
                        }))
                    }
                    placeholder="e.g. HAM"
                    />
              </div>

              {/* Address */}
              <Field
                label="Address"
                value={form.address}
                onChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    address: value,
                  }))
                }
                placeholder="Branch address"
              />

              <div>
                <p className="mb-2 text-sm font-semibold text-slate-700">Map coordinates</p>
                <p className="mb-3 text-xs text-slate-500">
                  Used to suggest the nearest branch for delivery. Leave both blank to use the main branch by default.
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Latitude"
                    type="number"
                    value={form.latitude}
                    onChange={(value) => setForm((current) => ({ ...current, latitude: value }))}
                    placeholder="e.g. 33.8938"
                  />
                  <Field
                    label="Longitude"
                    type="number"
                    value={form.longitude}
                    onChange={(value) => setForm((current) => ({ ...current, longitude: value }))}
                    placeholder="e.g. 35.5018"
                  />
                </div>
              </div>

              {/* Phone / Email */}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Phone"
                  value={form.phone}
                  onChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      phone: value,
                    }))
                  }
                  placeholder="+961..."
                />

                <Field
                  label="Email"
                  type="email"
                  value={form.email}
                  onChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      email: value,
                    }))
                  }
                  placeholder="branch@example.com"
                />
              </div>

              {/* Opening hours */}
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Opening hours
                </label>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-500">
                      Opens
                    </label>

                    <input
                      type="time"
                      value={form.opening_time}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          opening_time:
                            event.target.value,
                        }))
                      }
                      className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-[#536dfe] focus:bg-white focus:ring-2 focus:ring-[#536dfe]/10"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-500">
                      Closes
                    </label>

                    <input
                      type="time"
                      value={form.closing_time}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          closing_time:
                            event.target.value,
                        }))
                      }
                      className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-[#536dfe] focus:bg-white focus:ring-2 focus:ring-[#536dfe]/10"
                    />
                  </div>
                </div>
              </div>

              {/* Status */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <label className="flex cursor-pointer items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold">
                      Active branch
                    </p>

                    <p className="mt-1 text-xs text-slate-500">
                      Inactive branches remain in your records but
                      can be excluded from active operations.
                    </p>
                  </div>

                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        is_active:
                          event.target.checked,
                      }))
                    }
                    className="h-5 w-5 rounded border-slate-300 text-[#536dfe] focus:ring-[#536dfe]"
                  />
                </label>
              </div>

              {/* Main */}
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <label className="flex cursor-pointer items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-amber-900">
                      Main branch
                    </p>

                    <p className="mt-1 text-xs text-amber-800/70">
                      Only one branch can be the main branch.
                    </p>
                  </div>

                  <input
                    type="checkbox"
                    checked={form.is_main}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        is_main:
                          event.target.checked,
                      }))
                    }
                    className="h-5 w-5 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                  />
                </label>
              </div>
            </div>

            <div className="sticky bottom-0 flex justify-end gap-3 border-t border-slate-100 bg-white px-6 py-4">
              <button
                type="button"
                onClick={closeModal}
                disabled={saving}
                className="h-11 rounded-xl border border-slate-200 px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={saveBranch}
                disabled={saving}
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#536dfe] px-6 text-sm font-semibold text-white hover:bg-[#465de0] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving && (
                  <Loader2
                    size={16}
                    className="animate-spin"
                  />
                )}

                {editingBranch
                  ? 'Save changes'
                  : 'Create branch'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================
          DELETE CONFIRMATION
          ===================================================== */}

      {deleteConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#202534]/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 text-red-600">
              <Trash2 size={21} />
            </div>

            <h2 className="text-lg font-bold">
              Delete branch?
            </h2>

            <p className="mt-2 text-sm leading-6 text-slate-500">
              Are you sure you want to delete{' '}
              <strong className="text-slate-700">
                {deleteConfirm.name}
              </strong>
              ? This action cannot be undone.
            </p>

            {deleteConfirm.is_main && (
              <div className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
                This is your main branch. Set another branch
                as main before deleting it.
              </div>
            )}

            {branches.length <= 1 && (
              <div className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
                This is your only branch. Create another branch
                before deleting this one.
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteConfirm(null)}
                disabled={!!deleting}
                className="h-11 rounded-xl border border-slate-200 px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={deleteBranch}
                disabled={
                  !!deleting ||
                  deleteConfirm.is_main ||
                  branches.length <= 1
                }
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-red-600 px-5 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deleting === deleteConfirm.id && (
                  <Loader2
                    size={16}
                    className="animate-spin"
                  />
                )}

                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FOOTER */}

        <footer className="px-4 pb-8 pt-2 sm:px-6 lg:px-8">
          <div
            className="mx-auto flex max-w-[1400px] items-center justify-between border-t pt-5"
            style={{ borderColor: 'var(--portal-border)' }}
          >
            <div className="py-10 text-center">

              <div className="flex items-center justify-center gap-2">

                <div className="w-5 h-5 overflow-hidden rounded-md">
                  <img
                    src="/partnerlogo-icon.png"
                    alt="Partner"
                    className="h-full w-full object-cover"
                  />
                </div>

                <span className="text-[9px] font-black tracking-[0.16em] text-[#756F66]">
                  Partner
                </span>

              </div>

            </div>

            <p
              className="text-[9px]"
              style={{
                color: 'var(--portal-text)',
                opacity: 0.4,
              }}
            >
              Branches Workspace
            </p>
          </div>
        </footer>

    </div>
  );
}

// ============================================================
// Field component
// ============================================================

function Field({
  label,
  required,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-semibold text-slate-700">
        {label}
        {required && (
          <span className="ml-1 text-red-500">*</span>
        )}
      </label>

      <input
        type={type}
        value={value}
        onChange={(event) =>
          onChange(event.target.value)
        }
        placeholder={placeholder}
        className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-[#536dfe] focus:bg-white focus:ring-2 focus:ring-[#536dfe]/10"
      />
    </div>
  );
}