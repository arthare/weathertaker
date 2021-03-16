import { exec, execSync } from "child_process";

let g_watchdogTimeout = null;
export function feedWatchdog() {
  const msInMinute = 60*1000;

  clearTimeout(g_watchdogTimeout);
  g_watchdogTimeout = setTimeout(() => {
    exec('sudo reboot');
  }, 300*msInMinute);
}