import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";

const items = [
  { to: "/worker/dashboard", icon: "🏠", key: "dashboard.welcome" as const, short: "Home" },
  { to: "/worker/documents", icon: "📄", key: "dashboard.documentWallet" as const, short: "Docs" },
  { to: "/worker/grievances", icon: "📢", key: "dashboard.grievances" as const, short: "Grievance" },
  { to: "/worker/notifications", icon: "🔔", key: "notifications.title" as const, short: "Alerts" },
  { to: "/worker/chat", icon: "💬", key: "dashboard.aiChatbot" as const, short: "Assistant" },
  { to: "/worker/settings", icon: "⚙️", key: "dashboard.settings" as const, short: "Settings" },
];

export function BottomNav() {
  const { t } = useTranslation();
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex justify-around py-1.5 z-20 safe-area-bottom">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl text-[10px] font-medium min-w-[56px] ${
              isActive
                ? "text-brand-600 dark:text-brand-400"
                : "text-gray-500 dark:text-gray-400"
            }`
          }
        >
          <span className="text-lg">{item.icon}</span>
          <span className="truncate max-w-[60px]">{t(item.key, item.short)}</span>
        </NavLink>
      ))}
    </nav>
  );
}
