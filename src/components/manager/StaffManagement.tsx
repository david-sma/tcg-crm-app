import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../../lib/api.ts';
import { PasswordRevealModal } from '../common/PasswordRevealModal.tsx';
import type { User, UserRole } from '../../types/index.ts';
import { useBrand } from '../../context/BrandContext.tsx';
import {
  UserPlus,
  Search,
  KeyRound,
  Edit2,
  UserCheck,
  UserX,
  Phone,
  FileText,
  Check,
  AlertCircle,
  X,
  Shield,
  User as UserIcon,
  ArrowRightLeft,
  Crown,
  Users,
} from 'lucide-react';

export const roleLabel = (role: UserRole): string => {
  if (role === 'manager') return 'Manager';
  if (role === 'team_leader') return 'Team Leader';
  return 'Staff';
};

export const StaffManagement: React.FC = () => {
  const { phone } = useBrand();
  const [staffList, setStaffList] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('active');
  const [roleFilter, setRoleFilter] = useState<'all' | 'staff' | 'team_leader' | 'manager'>('all');

  // Create Staff Modal State
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createPhone, setCreatePhone] = useState('');
  const [createNotes, setCreateNotes] = useState('');
  const [createRole, setCreateRole] = useState<UserRole>('staff');
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState('');

  // Edit Staff Modal State
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<User | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('staff');
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState('');

  // Dedicated Role Change Confirmation Modal State
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [targetRoleStaff, setTargetRoleStaff] = useState<User | null>(null);
  const [targetNewRole, setTargetNewRole] = useState<UserRole>('manager');
  const [roleSubmitting, setRoleSubmitting] = useState(false);
  const [roleError, setRoleError] = useState('');

  // Password Reveal Modal State
  const [revealModalOpen, setRevealModalOpen] = useState(false);
  const [revealedStaffName, setRevealedStaffName] = useState('');
  const [revealedStaffPhone, setRevealedStaffPhone] = useState('');
  const [revealedPassword, setRevealedPassword] = useState('');
  const [isPasswordReset, setIsPasswordReset] = useState(false);

  // Toggle Status Confirmation Modal State
  const [toggleModalOpen, setToggleModalOpen] = useState(false);
  const [targetToggleStaff, setTargetToggleStaff] = useState<User | null>(null);
  const [toggleSubmitting, setToggleSubmitting] = useState(false);

  // Reset Password Confirmation Modal State
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [targetResetStaff, setTargetResetStaff] = useState<User | null>(null);
  const [resetSubmitting, setResetSubmitting] = useState(false);

  // Toast / Notification State
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage((current) => (current?.text === text ? null : current));
    }, 4000);
  };

  const loadStaff = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiFetch<{ staff: User[] }>('/api/staff');
      setStaffList(data.staff || []);
    } catch (err: any) {
      console.error('Failed to load staff list:', err);
      showToast(err?.message || 'Failed to load staff list', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStaff();
  }, [loadStaff]);

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createName.trim() || !createPhone.trim()) {
      setCreateError('Name and phone number are required.');
      return;
    }

    try {
      setCreateSubmitting(true);
      setCreateError('');
      const data = await apiFetch<{ user: User; generatedPassword: string }>('/api/staff', {
        method: 'POST',
        body: JSON.stringify({
          name: createName.trim(),
          phone: createPhone.trim(),
          notes: createNotes.trim() || undefined,
          role: createRole,
        }),
      });

      // Close create form and open one-time password reveal modal
      setCreateModalOpen(false);
      setCreateName('');
      setCreatePhone('');
      setCreateNotes('');
      setCreateRole('staff');

      setRevealedStaffName(data.user.name);
      setRevealedStaffPhone(data.user.phone_e164);
      setRevealedPassword(data.generatedPassword);
      setIsPasswordReset(false);
      setRevealModalOpen(true);

      showToast(`Account created for ${data.user.name} (${roleLabel(data.user.role)})`, 'success');
      loadStaff();
    } catch (err: any) {
      setCreateError(err?.message || 'Failed to create account');
    } finally {
      setCreateSubmitting(false);
    }
  };

  const handleOpenEdit = (staff: User) => {
    setEditingStaff(staff);
    setEditName(staff.name);
    setEditPhone(staff.phone_e164);
    setEditNotes(staff.notes || '');
    setEditRole(staff.role);
    setEditError('');
    setEditModalOpen(true);
  };

  const handleEditStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStaff) return;

    try {
      setEditSubmitting(true);
      setEditError('');
      await apiFetch(`/api/staff/${editingStaff.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: editName.trim(),
          phone: editPhone.trim(),
          notes: editNotes.trim() || null,
          role: editRole,
        }),
      });

      setEditModalOpen(false);
      showToast(`Updated details for ${editName.trim()}`, 'success');
      loadStaff();
    } catch (err: any) {
      setEditError(err?.message || 'Failed to update member');
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleOpenRoleModal = (staff: User, newRole: UserRole) => {
    setTargetRoleStaff(staff);
    setTargetNewRole(newRole);
    setRoleError('');
    setRoleModalOpen(true);
  };

  const handleConfirmRoleChange = async () => {
    if (!targetRoleStaff) return;

    try {
      setRoleSubmitting(true);
      setRoleError('');
      const res = await apiFetch<{ user: User; message: string }>(`/api/staff/${targetRoleStaff.id}/role`, {
        method: 'POST',
        body: JSON.stringify({ role: targetNewRole }),
      });

      setRoleModalOpen(false);
      setTargetRoleStaff(null);
      showToast(res.message || `Role updated to ${roleLabel(targetNewRole)}`, 'success');
      await loadStaff();
    } catch (err: any) {
      setRoleError(err?.message || 'Failed to change role');
    } finally {
      setRoleSubmitting(false);
    }
  };

  const handleOpenToggleStatus = (staff: User) => {
    setTargetToggleStaff(staff);
    setToggleModalOpen(true);
  };

  const handleConfirmToggleStatus = async () => {
    if (!targetToggleStaff) return;

    try {
      setToggleSubmitting(true);
      const res = await apiFetch<{ is_active: boolean }>(`/api/staff/${targetToggleStaff.id}/toggle-status`, {
        method: 'POST',
      });
      const newStatusText = res.is_active ? 'activated' : 'deactivated';
      showToast(`${targetToggleStaff.name} has been ${newStatusText}.`, 'success');
      setToggleModalOpen(false);
      setTargetToggleStaff(null);
      await loadStaff();
    } catch (err: any) {
      showToast(err?.message || 'Failed to change member status', 'error');
    } finally {
      setToggleSubmitting(false);
    }
  };

  const handleOpenResetPassword = (staff: User) => {
    setTargetResetStaff(staff);
    setResetModalOpen(true);
  };

  const handleConfirmResetPassword = async () => {
    if (!targetResetStaff) return;

    try {
      setResetSubmitting(true);
      const data = await apiFetch<{ generatedPassword: string }>(`/api/staff/${targetResetStaff.id}/reset-password`, {
        method: 'POST',
      });

      const staffName = targetResetStaff.name;
      const staffPhone = targetResetStaff.phone_e164;

      setResetModalOpen(false);
      setTargetResetStaff(null);

      setRevealedStaffName(staffName);
      setRevealedStaffPhone(staffPhone);
      setRevealedPassword(data.generatedPassword);
      setIsPasswordReset(true);
      setRevealModalOpen(true);

      showToast(`Password reset generated for ${staffName}`, 'success');
      await loadStaff();
    } catch (err: any) {
      showToast(err?.message || 'Failed to reset password', 'error');
    } finally {
      setResetSubmitting(false);
    }
  };

  const filteredStaff = staffList.filter((s) => {
    const q = (searchQuery || '').toLowerCase().trim();
    const nameStr = (s?.name || '').toLowerCase();
    const phoneStr = (s?.phone_e164 || '').toLowerCase();
    const notesStr = (s?.notes || '').toLowerCase();
    const matchesSearch = !q || nameStr.includes(q) || phoneStr.includes(q) || notesStr.includes(q) || s.role.includes(q);
    const matchesStatus =
      statusFilter === 'all' ? true : statusFilter === 'active' ? s.is_active : !s.is_active;
    const matchesRole =
      roleFilter === 'all' ? true : s.role === roleFilter;
    return matchesSearch && matchesStatus && matchesRole;
  });

  const managerCount = staffList.filter((s) => s.role === 'manager').length;
  const teamLeadCount = staffList.filter((s) => s.role === 'team_leader').length;
  const workerCount = staffList.filter((s) => s.role === 'staff').length;

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div
          id="staff-toast-banner"
          className={`p-4 rounded-xl flex items-center justify-between gap-3 text-sm font-medium border animate-in fade-in duration-150 ${
            toastMessage.type === 'error'
              ? 'bg-rose-50 text-rose-800 border-rose-200'
              : 'bg-emerald-50 text-emerald-800 border-emerald-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {toastMessage.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            ) : (
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            )}
            <span>{toastMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="p-1 hover:bg-black/5 rounded-lg text-slate-500 hover:text-slate-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header & Create Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Cleaning Team & Staff Directory</h1>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            Manage cleaning specialists and operations managers, provision access credentials, and maintain team profiles.
          </p>
        </div>

        <button
          id="open-create-staff-modal-btn"
          type="button"
          onClick={() => {
            setCreateRole('staff');
            setCreateError('');
            setCreateModalOpen(true);
          }}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-sky-700 hover:bg-sky-800 text-white font-medium text-sm transition-colors shadow-xs shrink-0 cursor-pointer"
        >
          <UserPlus className="w-4 h-4" />
          <span>Add Cleaning Specialist</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-3 bg-white rounded-2xl border border-slate-200 shadow-xs">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            id="staff-search-input"
            type="text"
            placeholder="Search by name, phone, notes, or role..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-slate-900"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Role Filter */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl shrink-0">
            <button
              id="filter-role-all-btn"
              type="button"
              onClick={() => setRoleFilter('all')}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-all ${
                roleFilter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Roles ({staffList.length})
            </button>
            <button
              id="filter-role-staff-btn"
              type="button"
              onClick={() => setRoleFilter('staff')}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center gap-1 ${
                roleFilter === 'staff' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <UserIcon className="w-3 h-3 text-slate-500" />
              <span>Staff ({workerCount})</span>
            </button>
            <button
              id="filter-role-team-leader-btn"
              type="button"
              onClick={() => setRoleFilter('team_leader')}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center gap-1 ${
                roleFilter === 'team_leader' ? 'bg-white text-sky-950 font-semibold shadow-xs' : 'text-slate-600 hover:text-sky-900'
              }`}
            >
              <Users className="w-3 h-3 text-sky-600" />
              <span>Team Leads ({teamLeadCount})</span>
            </button>
            <button
              id="filter-role-manager-btn"
              type="button"
              onClick={() => setRoleFilter('manager')}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center gap-1 ${
                roleFilter === 'manager' ? 'bg-white text-purple-950 font-semibold shadow-xs' : 'text-slate-600 hover:text-purple-900'
              }`}
            >
              <Shield className="w-3 h-3 text-purple-600" />
              <span>Managers ({managerCount})</span>
            </button>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl shrink-0">
            <button
              id="filter-status-active-btn"
              type="button"
              onClick={() => setStatusFilter('active')}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-all ${
                statusFilter === 'active' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Active ({staffList.filter((s) => s.is_active).length})
            </button>
            <button
              id="filter-status-inactive-btn"
              type="button"
              onClick={() => setStatusFilter('inactive')}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-all ${
                statusFilter === 'inactive' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Inactive ({staffList.filter((s) => !s.is_active).length})
            </button>
            <button
              id="filter-status-all-btn"
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-all ${
                statusFilter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Status
            </button>
          </div>
        </div>
      </div>

      {/* Staff List Cards / Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm animate-pulse">Loading team records...</div>
        ) : filteredStaff.length === 0 ? (
          <div className="p-12 text-center space-y-2 text-slate-500">
            <UserX className="w-10 h-10 text-slate-300 mx-auto" />
            <p className="text-sm font-semibold text-slate-800">No team members found</p>
            <p className="text-xs text-slate-400">Try adjusting your filters or add a new team member.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredStaff.map((staff) => {
              const isManager = staff.role === 'manager';
              const isTeamLead = staff.role === 'team_leader';

              return (
                <div
                  key={staff.id}
                  id={`staff-row-${staff.id}`}
                  className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors"
                >
                  <div className="flex items-start gap-3.5">
                    <div
                      className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 border relative ${
                        isManager
                          ? 'bg-purple-50 text-purple-800 border-purple-200'
                          : isTeamLead
                          ? 'bg-sky-50 text-sky-800 border-sky-200'
                          : staff.is_active
                          ? 'bg-slate-100 text-slate-800 border-slate-200'
                          : 'bg-rose-50 text-rose-600 border-rose-200'
                      }`}
                    >
                      {staff.name.charAt(0)}
                      {isManager && (
                        <span className="absolute -bottom-1 -right-1 bg-purple-600 text-white p-0.5 rounded-full ring-2 ring-white">
                          <Crown className="w-2.5 h-2.5" />
                        </span>
                      )}
                    </div>

                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-slate-900 text-base">{staff.name}</h3>

                        {/* Role Badge */}
                        <span
                          id={`role-badge-${staff.id}`}
                          className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1 border ${
                            isManager
                              ? 'bg-purple-100 text-purple-900 border-purple-300'
                              : isTeamLead
                              ? 'bg-sky-100 text-sky-900 border-sky-300'
                              : 'bg-slate-100 text-slate-700 border-slate-300'
                          }`}
                        >
                          {isManager ? <Shield className="w-3 h-3 text-purple-700" /> : isTeamLead ? <Users className="w-3 h-3 text-sky-700" /> : <UserIcon className="w-3 h-3 text-slate-500" />}
                          <span>{roleLabel(staff.role)}</span>
                        </span>

                        {/* Active/Inactive Status Badge */}
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider ${
                            staff.is_active
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : 'bg-rose-100 text-rose-800 border border-rose-200'
                          }`}
                        >
                          {staff.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-slate-500">
                        <span className="flex items-center gap-1 font-mono font-medium text-slate-700">
                          <Phone className="w-3.5 h-3.5 text-slate-400" />
                          {staff.phone_e164}
                        </span>
                        {staff.notes && (
                          <span className="flex items-center gap-1 text-slate-500 italic">
                            <FileText className="w-3.5 h-3.5 text-slate-400" />
                            {staff.notes}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div className="flex flex-wrap items-center gap-1.5 self-start lg:self-auto shrink-0">
                    {/* Role Selector */}
                    <div
                      id={`switch-role-btn-${staff.id}`}
                      className={`inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-lg border text-xs font-semibold transition-all ${
                        isManager
                          ? 'border-purple-200 bg-purple-50/70 text-purple-900'
                          : isTeamLead
                          ? 'border-sky-200 bg-sky-50/70 text-sky-900'
                          : 'border-slate-200 bg-white text-slate-700'
                      }`}
                      title={`Change role for ${staff.name}`}
                    >
                      <ArrowRightLeft className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <select
                        id={`role-select-${staff.id}`}
                        value={staff.role}
                        onChange={(e) => {
                          const newRole = e.target.value as UserRole;
                          if (newRole !== staff.role) handleOpenRoleModal(staff, newRole);
                        }}
                        className="bg-transparent text-xs font-semibold py-0.5 pr-1 focus:outline-hidden cursor-pointer"
                        aria-label={`Change role for ${staff.name}`}
                      >
                        <option value="staff">Staff</option>
                        <option value="team_leader">Team Leader</option>
                        <option value="manager">Manager</option>
                      </select>
                    </div>

                    {/* Reset Password Button */}
                    <button
                      id={`reset-password-btn-${staff.id}`}
                      type="button"
                      onClick={() => handleOpenResetPassword(staff)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-medium transition-colors"
                      title="Generate replacement password"
                    >
                      <KeyRound className="w-3.5 h-3.5 text-amber-600" />
                      <span>Reset Pass</span>
                    </button>

                    {/* Edit Details Button */}
                    <button
                      id={`edit-staff-btn-${staff.id}`}
                      type="button"
                      onClick={() => handleOpenEdit(staff)}
                      className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 transition-colors"
                      title="Edit member details & role"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>

                    {/* Toggle Status Button */}
                    <button
                      id={`toggle-status-btn-${staff.id}`}
                      type="button"
                      onClick={() => handleOpenToggleStatus(staff)}
                      className={`p-2 rounded-lg border transition-colors ${
                        staff.is_active
                          ? 'border-slate-200 bg-white hover:bg-rose-50 text-slate-600 hover:text-rose-600'
                          : 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700'
                      }`}
                      title={staff.is_active ? 'Deactivate member' : 'Activate member'}
                    >
                      {staff.is_active ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Role Change Confirmation Modal */}
      {roleModalOpen && targetRoleStaff && (
        <div id="role-change-modal-backdrop" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div id="role-change-modal-card" className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <div className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-purple-700" />
                  <h2 className="text-base font-semibold text-slate-900">Change Account Role</h2>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setRoleModalOpen(false);
                    setTargetRoleStaff(null);
                  }}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                {roleError && (
                  <div className="p-3 text-xs bg-rose-50 text-rose-700 rounded-xl border border-rose-200">
                    {roleError}
                  </div>
                )}

                <div>
                  <label htmlFor="role-change-new-role-select" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    New role
                  </label>
                  <select
                    id="role-change-new-role-select"
                    value={targetNewRole}
                    onChange={(e) => setTargetNewRole(e.target.value as UserRole)}
                    className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-700"
                  >
                    <option value="staff">Staff</option>
                    <option value="team_leader">Team Leader</option>
                    <option value="manager">Manager</option>
                  </select>
                </div>

                <p className="text-sm text-slate-600 leading-relaxed">
                  Change role for <strong className="font-semibold text-slate-900">{targetRoleStaff.name}</strong> from{' '}
                  <span className="font-semibold uppercase text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-800">
                    {roleLabel(targetRoleStaff.role)}
                  </span>{' '}
                  to{' '}
                  <span className="font-semibold uppercase text-xs px-2 py-0.5 rounded bg-purple-100 text-purple-900">
                    {roleLabel(targetNewRole)}
                  </span>?
                </p>

                {targetNewRole === 'manager' ? (
                  <div className="p-3.5 bg-purple-50 border border-purple-200 rounded-xl text-xs text-purple-900 space-y-1.5">
                    <p className="font-semibold flex items-center gap-1.5 text-purple-900">
                      <Shield className="w-4 h-4 text-purple-700 shrink-0" />
                      Granting Manager Permissions
                    </p>
                    <ul className="list-disc pl-4 text-purple-800 space-y-0.5">
                      <li>Can build, edit, and publish weekly rosters for all staff.</li>
                      <li>Can create, edit, deactivate team accounts and reset credentials.</li>
                      <li>Can review staff availability submissions and view audit logs.</li>
                    </ul>
                  </div>
                ) : (
                  <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1.5">
                    <p className="font-semibold flex items-center gap-1.5 text-amber-900">
                      <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
                      Moving to a non-manager role
                    </p>
                    <ul className="list-disc pl-4 text-amber-800 space-y-0.5">
                      <li>User will no longer have access to the manager roster builder or staff admin panels.</li>
                      <li>User can view their personal published shifts and submit weekly availability.</li>
                      <li>Demoting the last manager is not allowed — at least one manager must remain.</li>
                    </ul>
                  </div>
                )}

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setRoleModalOpen(false);
                      setTargetRoleStaff(null);
                    }}
                    disabled={roleSubmitting}
                    className="flex-1 py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 font-medium text-sm hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    id="confirm-role-change-btn"
                    type="button"
                    onClick={handleConfirmRoleChange}
                    disabled={roleSubmitting}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-medium text-sm transition-colors shadow-xs disabled:opacity-50"
                  >
                    {roleSubmitting ? 'Updating Role...' : `Set as ${roleLabel(targetNewRole)}`}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Team Member Modal */}
      {createModalOpen && (
        <div id="create-staff-modal-backdrop" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div id="create-staff-modal-card" className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <div className="flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-slate-800" />
                  <h2 className="text-base font-semibold text-slate-900">Add Team Member</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreateStaff} className="space-y-4">
                {createError && (
                  <div className="p-3 text-xs bg-rose-50 text-rose-700 rounded-xl border border-rose-200">
                    {createError}
                  </div>
                )}

                <div>
                  <label htmlFor="create-staff-name-input" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Full Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="create-staff-name-input"
                    type="text"
                    required
                    placeholder="e.g. Mike"
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-slate-900"
                  />
                </div>

                <div>
                  <label htmlFor="create-staff-phone-input" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Phone Number <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="create-staff-phone-input"
                    type="tel"
                    required
                    placeholder={`e.g. ${phone.example}`}
                    value={createPhone}
                    onChange={(e) => setCreatePhone(e.target.value)}
                    className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-sm font-mono focus:outline-hidden focus:ring-2 focus:ring-slate-900"
                  />
                  <span className="text-[11px] text-slate-400 mt-1 block">
                    {phone.help}
                  </span>
                </div>

                {/* Role Selector */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Account Role <span className="text-rose-500">*</span>
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      id="create-role-staff-opt"
                      onClick={() => setCreateRole('staff')}
                      className={`p-3 rounded-xl border text-left transition-all flex items-start gap-2.5 ${
                        createRole === 'staff'
                          ? 'border-slate-900 bg-slate-900 text-white shadow-xs'
                          : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <UserIcon className="w-4 h-4 shrink-0 mt-0.5" />
                      <div>
                        <div className="text-xs font-bold">Staff</div>
                        <div className={`text-[10px] mt-0.5 ${createRole === 'staff' ? 'text-slate-300' : 'text-slate-400'}`}>
                          Standard worker
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      id="create-role-team-leader-opt"
                      onClick={() => setCreateRole('team_leader')}
                      className={`p-3 rounded-xl border text-left transition-all flex items-start gap-2.5 ${
                        createRole === 'team_leader'
                          ? 'border-sky-800 bg-sky-800 text-white shadow-xs'
                          : 'border-slate-200 bg-white hover:bg-sky-50 text-slate-700'
                      }`}
                    >
                      <Users className="w-4 h-4 shrink-0 mt-0.5" />
                      <div>
                        <div className="text-xs font-bold">Team Leader</div>
                        <div className={`text-[10px] mt-0.5 ${createRole === 'team_leader' ? 'text-sky-200' : 'text-slate-400'}`}>
                          Crew lead
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      id="create-role-manager-opt"
                      onClick={() => setCreateRole('manager')}
                      className={`p-3 rounded-xl border text-left transition-all flex items-start gap-2.5 ${
                        createRole === 'manager'
                          ? 'border-purple-800 bg-purple-800 text-white shadow-xs'
                          : 'border-slate-200 bg-white hover:bg-purple-50 text-slate-700'
                      }`}
                    >
                      <Shield className="w-4 h-4 shrink-0 mt-0.5" />
                      <div>
                        <div className="text-xs font-bold">Manager</div>
                        <div className={`text-[10px] mt-0.5 ${createRole === 'manager' ? 'text-purple-200' : 'text-slate-400'}`}>
                          Admin & roster control
                        </div>
                      </div>
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="create-staff-notes-input" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Internal Notes (Optional)
                  </label>
                  <textarea
                    id="create-staff-notes-input"
                    rows={2}
                    placeholder="e.g. Shift supervisor, barista, driver"
                    value={createNotes}
                    onChange={(e) => setCreateNotes(e.target.value)}
                    className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-slate-900"
                  />
                </div>

                <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-500 leading-relaxed border border-slate-200">
                  A unique 8-character temporary password will be generated and displayed once on screen for you to distribute.
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setCreateModalOpen(false)}
                    className="flex-1 py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 font-medium text-sm hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    id="submit-create-staff-btn"
                    type="submit"
                    disabled={createSubmitting}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-slate-900 text-white font-medium text-sm hover:bg-slate-800 transition-colors shadow-xs disabled:opacity-50"
                  >
                    {createSubmitting ? 'Creating...' : 'Create Account'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Edit Staff / Manager Modal */}
      {editModalOpen && (
        <div id="edit-staff-modal-backdrop" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div id="edit-staff-modal-card" className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <div className="flex items-center gap-2">
                  <Edit2 className="w-5 h-5 text-slate-800" />
                  <h2 className="text-base font-semibold text-slate-900">Edit Member Details & Role</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setEditModalOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleEditStaff} className="space-y-4">
                {editError && (
                  <div className="p-3 text-xs bg-rose-50 text-rose-700 rounded-xl border border-rose-200">
                    {editError}
                  </div>
                )}

                <div>
                  <label htmlFor="edit-staff-name-input" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Full Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="edit-staff-name-input"
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-slate-900"
                  />
                </div>

                <div>
                  <label htmlFor="edit-staff-phone-input" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Phone Number <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="edit-staff-phone-input"
                    type="tel"
                    required
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-sm font-mono focus:outline-hidden focus:ring-2 focus:ring-slate-900"
                  />
                </div>

                {/* Role Switcher in Edit */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Role
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      id="edit-role-staff-opt"
                      onClick={() => setEditRole('staff')}
                      className={`p-3 rounded-xl border text-left transition-all flex items-start gap-2.5 ${
                        editRole === 'staff'
                          ? 'border-slate-900 bg-slate-900 text-white shadow-xs'
                          : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <UserIcon className="w-4 h-4 shrink-0 mt-0.5" />
                      <div>
                        <div className="text-xs font-bold">Staff</div>
                        <div className={`text-[10px] mt-0.5 ${editRole === 'staff' ? 'text-slate-300' : 'text-slate-400'}`}>
                          Standard worker
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      id="edit-role-team-leader-opt"
                      onClick={() => setEditRole('team_leader')}
                      className={`p-3 rounded-xl border text-left transition-all flex items-start gap-2.5 ${
                        editRole === 'team_leader'
                          ? 'border-sky-800 bg-sky-800 text-white shadow-xs'
                          : 'border-slate-200 bg-white hover:bg-sky-50 text-slate-700'
                      }`}
                    >
                      <Users className="w-4 h-4 shrink-0 mt-0.5" />
                      <div>
                        <div className="text-xs font-bold">Team Leader</div>
                        <div className={`text-[10px] mt-0.5 ${editRole === 'team_leader' ? 'text-sky-200' : 'text-slate-400'}`}>
                          Crew lead
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      id="edit-role-manager-opt"
                      onClick={() => setEditRole('manager')}
                      className={`p-3 rounded-xl border text-left transition-all flex items-start gap-2.5 ${
                        editRole === 'manager'
                          ? 'border-purple-800 bg-purple-800 text-white shadow-xs'
                          : 'border-slate-200 bg-white hover:bg-purple-50 text-slate-700'
                      }`}
                    >
                      <Shield className="w-4 h-4 shrink-0 mt-0.5" />
                      <div>
                        <div className="text-xs font-bold">Manager</div>
                        <div className={`text-[10px] mt-0.5 ${editRole === 'manager' ? 'text-purple-200' : 'text-slate-400'}`}>
                          Full management access
                        </div>
                      </div>
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="edit-staff-notes-input" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Internal Notes
                  </label>
                  <textarea
                    id="edit-staff-notes-input"
                    rows={2}
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-slate-900"
                  />
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditModalOpen(false)}
                    className="flex-1 py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 font-medium text-sm hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    id="submit-edit-staff-btn"
                    type="submit"
                    disabled={editSubmitting}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-slate-900 text-white font-medium text-sm hover:bg-slate-800 transition-colors shadow-xs disabled:opacity-50"
                  >
                    {editSubmitting ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Toggle Status Confirmation Modal */}
      {toggleModalOpen && targetToggleStaff && (
        <div id="toggle-status-modal-backdrop" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div id="toggle-status-modal-card" className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <div className="flex items-center gap-2">
                  {targetToggleStaff.is_active ? (
                    <UserX className="w-5 h-5 text-rose-600" />
                  ) : (
                    <UserCheck className="w-5 h-5 text-emerald-600" />
                  )}
                  <h2 className="text-base font-semibold text-slate-900">
                    {targetToggleStaff.is_active ? 'Deactivate Account' : 'Activate Account'}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setToggleModalOpen(false);
                    setTargetToggleStaff(null);
                  }}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <p className="text-sm text-slate-600 leading-relaxed">
                  Are you sure you want to {targetToggleStaff.is_active ? 'deactivate' : 'activate'}{' '}
                  <strong className="font-semibold text-slate-900">{targetToggleStaff.name}</strong> ({targetToggleStaff.phone_e164})?
                </p>

                {targetToggleStaff.is_active ? (
                  <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 space-y-1">
                    <p className="font-semibold flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                      Immediate Account Effects
                    </p>
                    <p className="text-rose-700">
                      All active login sessions for this account will be revoked immediately, and they will not be able to log in until re-activated.
                    </p>
                  </div>
                ) : (
                  <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 space-y-1">
                    <p className="font-semibold flex items-center gap-1.5">
                      <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                      Account Restoration
                    </p>
                    <p className="text-emerald-700">
                      This user will be marked as active and can log in with their current password.
                    </p>
                  </div>
                )}

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setToggleModalOpen(false);
                      setTargetToggleStaff(null);
                    }}
                    disabled={toggleSubmitting}
                    className="flex-1 py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 font-medium text-sm hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    id="confirm-toggle-status-btn"
                    type="button"
                    onClick={handleConfirmToggleStatus}
                    disabled={toggleSubmitting}
                    className={`flex-1 py-2.5 px-4 rounded-xl font-medium text-sm transition-colors shadow-xs disabled:opacity-50 ${
                      targetToggleStaff.is_active
                        ? 'bg-rose-600 hover:bg-rose-700 text-white'
                        : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    }`}
                  >
                    {toggleSubmitting
                      ? 'Updating...'
                      : targetToggleStaff.is_active
                      ? 'Deactivate Account'
                      : 'Activate Account'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Confirmation Modal */}
      {resetModalOpen && targetResetStaff && (
        <div id="reset-password-modal-backdrop" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div id="reset-password-modal-card" className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <div className="flex items-center gap-2">
                  <KeyRound className="w-5 h-5 text-amber-600" />
                  <h2 className="text-base font-semibold text-slate-900">Reset Account Password</h2>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setResetModalOpen(false);
                    setTargetResetStaff(null);
                  }}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <p className="text-sm text-slate-600 leading-relaxed">
                  Generate a new temporary password for{' '}
                  <strong className="font-semibold text-slate-900">{targetResetStaff.name}</strong> ({targetResetStaff.phone_e164})?
                </p>

                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1.5">
                  <p className="font-semibold flex items-center gap-1.5 text-amber-800">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                    Security & Session Revocation
                  </p>
                  <ul className="list-disc pl-4 text-amber-800 space-y-0.5">
                    <li>Their existing password will be permanently replaced.</li>
                    <li>All currently logged-in devices will be revoked immediately.</li>
                    <li>The new temporary 8-character password will be displayed once on your screen.</li>
                  </ul>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setResetModalOpen(false);
                      setTargetResetStaff(null);
                    }}
                    disabled={resetSubmitting}
                    className="flex-1 py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 font-medium text-sm hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    id="confirm-reset-password-btn"
                    type="button"
                    onClick={handleConfirmResetPassword}
                    disabled={resetSubmitting}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-medium text-sm transition-colors shadow-xs disabled:opacity-50"
                  >
                    {resetSubmitting ? 'Generating...' : 'Generate New Password'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Password Reveal Modal (One-Time Display) */}
      <PasswordRevealModal
        isOpen={revealModalOpen}
        onClose={() => setRevealModalOpen(false)}
        staffName={revealedStaffName}
        staffPhone={revealedStaffPhone}
        generatedPassword={revealedPassword}
        isReset={isPasswordReset}
      />
    </div>
  );
};
