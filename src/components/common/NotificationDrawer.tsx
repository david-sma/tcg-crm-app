import React from 'react';
import { X, Check, Bell, Calendar, AlertCircle, RefreshCw } from 'lucide-react';
import { useNotifications } from '../../context/NotificationContext.tsx';
import { formatDateTimeToNZ } from '../../lib/dateUtils.ts';

interface NotificationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NotificationDrawer: React.FC<NotificationDrawerProps> = ({ isOpen, onClose }) => {
  const { notifications, unreadCount, markAsRead, markAllAsRead, refreshNotifications, loading } = useNotifications();

  if (!isOpen) return null;

  return (
    <div id="notification-drawer-backdrop" className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-xs">
      <div
        id="notification-drawer-panel"
        className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-200"
      >
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-slate-700" />
            <h2 className="text-base font-semibold text-slate-900">Notifications</h2>
            {unreadCount > 0 && (
              <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-600 text-white">
                {unreadCount} new
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                id="mark-all-read-btn"
                type="button"
                onClick={markAllAsRead}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium px-2 py-1"
              >
                Mark all read
              </button>
            )}
            <button
              id="close-notifications-btn"
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {notifications.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <Bell className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm font-medium">No notifications yet</p>
              <p className="text-xs mt-1">You'll be notified when rosters are published or updated.</p>
            </div>
          ) : (
            notifications.map((item) => (
              <div
                key={item.id}
                id={`notification-item-${item.id}`}
                onClick={() => !item.is_read && markAsRead(item.id)}
                className={`p-4 rounded-xl border transition-all cursor-pointer ${
                  item.is_read
                    ? 'bg-white border-slate-200 text-slate-600'
                    : 'bg-blue-50/50 border-blue-200 text-slate-900 shadow-xs'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {item.type === 'ROSTER_PUBLISHED' || item.type === 'ROSTER_REVISED' ? (
                      <Calendar className="w-4 h-4 text-blue-600 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                    )}
                    <h3 className="text-sm font-semibold text-slate-900">{item.title}</h3>
                  </div>
                  {!item.is_read && <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0 mt-1" />}
                </div>

                <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">{item.body}</p>

                <div className="mt-2 text-[11px] text-slate-400 flex items-center justify-between">
                  <span>{formatDateTimeToNZ(item.created_at)}</span>
                  {item.is_read && (
                    <span className="flex items-center gap-0.5 text-emerald-600 font-medium">
                      <Check className="w-3 h-3" /> Read
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="p-3 bg-slate-50 border-t border-slate-100 text-center">
          <button
            id="refresh-notifications-btn"
            type="button"
            onClick={refreshNotifications}
            disabled={loading}
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>
    </div>
  );
};
