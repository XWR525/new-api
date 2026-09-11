/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

/**
 * 游乐场本地存储的按账号作用域键。
 *
 * 同一浏览器切换账号时，如果沿用无作用域的 playground_* 键，后一个账号会直接
 * 读到前一个账号保存的对话与配置。因此所有读写都必须经过本函数拿到
 * `playground_xxx:<用户ID>` 形式的键。
 *
 * 拿不到登录用户 ID 时返回 null：调用方必须跳过本次读写，绝不回退到无作用域键，
 * 否则又会回到跨账号泄露的老问题。
 *
 * @param {string} baseKey 基础键名（见 constants/playground.constants.js 的 STORAGE_KEYS）
 * @returns {string|null} 作用域键；未登录时为 null
 */
export function getPlaygroundStorageKey(baseKey) {
  try {
    const raw = localStorage.getItem('user');
    if (!raw) {
      return null;
    }
    const ownerId = JSON.parse(raw)?.id;
    if (!ownerId) {
      return null;
    }
    return `${baseKey}:${ownerId}`;
  } catch (error) {
    console.error('解析当前用户失败，跳过游乐场本地存储:', error);
    return null;
  }
}
