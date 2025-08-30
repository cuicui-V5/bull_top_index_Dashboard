import React, { useState } from "react";
import { Settings, Save, RotateCcw, Eye, EyeOff } from "lucide-react";

export default function SettingsPanel({ settings, onSettingsChange, onReset }) {
    const [isOpen, setIsOpen] = useState(false);
    const [localSettings, setLocalSettings] = useState(settings);

    const handleSave = () => {
        onSettingsChange(localSettings);
        setIsOpen(false);
    };

    const handleReset = () => {
        setLocalSettings(settings);
        onReset();
    };

    const updateSetting = (key, value) => {
        setLocalSettings(prev => ({
            ...prev,
            [key]: value,
        }));
    };

    return (
        <div className="relative">
            {/* 设置按钮 */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="p-2 rounded-lg bg-white shadow-md ring-1 ring-gray-100 hover:bg-gray-50"
                title="设置">
                <Settings className="w-5 h-5" />
            </button>

            {/* 设置面板 */}
            {isOpen && (
                <div className="absolute right-0 top-12 w-80 bg-white rounded-2xl shadow-lg ring-1 ring-gray-200 p-4 z-50">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-semibold">设置</h3>
                        <button
                            onClick={() => setIsOpen(false)}
                            className="text-gray-400 hover:text-gray-600">
                            ×
                        </button>
                    </div>

                    <div className="space-y-4">
                        {/* 图表设置 */}
                        <div>
                            <h4 className="text-xs font-medium text-slate-600 mb-2">
                                图表设置
                            </h4>
                            <div className="space-y-3">
                                <div>
                                    <label className="text-xs text-slate-500">
                                        最大点数
                                    </label>
                                    <select
                                        value={localSettings.maxPoints}
                                        onChange={e =>
                                            updateSetting(
                                                "maxPoints",
                                                Number(e.target.value),
                                            )
                                        }
                                        className="w-full mt-1 p-2 text-sm border rounded-md">
                                        <option value={300}>300</option>
                                        <option value={600}>600</option>
                                        <option value={800}>800</option>
                                        <option value={1200}>1200</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="text-xs text-slate-500">
                                        默认视图
                                    </label>
                                    <select
                                        value={localSettings.defaultView}
                                        onChange={e =>
                                            updateSetting(
                                                "defaultView",
                                                e.target.value,
                                            )
                                        }
                                        className="w-full mt-1 p-2 text-sm border rounded-md">
                                        <option value="day">日视图</option>
                                        <option value="week">周视图</option>
                                        <option value="month">月视图</option>
                                        <option value="year">年视图</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="text-xs text-slate-500">
                                        默认时间范围
                                    </label>
                                    <select
                                        value={localSettings.defaultRange}
                                        onChange={e =>
                                            updateSetting(
                                                "defaultRange",
                                                e.target.value,
                                            )
                                        }
                                        className="w-full mt-1 p-2 text-sm border rounded-md">
                                        <option value="30d">30天</option>
                                        <option value="3m">3个月</option>
                                        <option value="6m">6个月</option>
                                        <option value="1y">1年</option>
                                        <option value="2y">2年</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* 阈值设置 */}
                        <div>
                            <h4 className="text-xs font-medium text-slate-600 mb-2">
                                阈值设置
                            </h4>
                            <div className="space-y-3">
                                <div>
                                    <label className="text-xs text-slate-500">
                                        危险线阈值
                                    </label>
                                    <input
                                        type="number"
                                        value={localSettings.dangerThreshold}
                                        onChange={e =>
                                            updateSetting(
                                                "dangerThreshold",
                                                Number(e.target.value),
                                            )
                                        }
                                        className="w-full mt-1 p-2 text-sm border rounded-md"
                                        min="0"
                                        max="100"
                                    />
                                </div>

                                <div>
                                    <label className="text-xs text-slate-500">
                                        警告线阈值
                                    </label>
                                    <input
                                        type="number"
                                        value={localSettings.warningThreshold}
                                        onChange={e =>
                                            updateSetting(
                                                "warningThreshold",
                                                Number(e.target.value),
                                            )
                                        }
                                        className="w-full mt-1 p-2 text-sm border rounded-md"
                                        min="0"
                                        max="100"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* 显示设置 */}
                        <div>
                            <h4 className="text-xs font-medium text-slate-600 mb-2">
                                显示设置
                            </h4>
                            <div className="space-y-2">
                                <label className="flex items-center gap-2 text-sm">
                                    <input
                                        type="checkbox"
                                        checked={localSettings.showTrend}
                                        onChange={e =>
                                            updateSetting(
                                                "showTrend",
                                                e.target.checked,
                                            )
                                        }
                                        className="rounded"
                                    />
                                    显示趋势线
                                </label>
                                <label className="flex items-center gap-2 text-sm">
                                    <input
                                        type="checkbox"
                                        checked={localSettings.showGrid}
                                        onChange={e =>
                                            updateSetting(
                                                "showGrid",
                                                e.target.checked,
                                            )
                                        }
                                        className="rounded"
                                    />
                                    显示网格
                                </label>
                                <label className="flex items-center gap-2 text-sm">
                                    <input
                                        type="checkbox"
                                        checked={localSettings.showBrush}
                                        onChange={e =>
                                            updateSetting(
                                                "showBrush",
                                                e.target.checked,
                                            )
                                        }
                                        className="rounded"
                                    />
                                    显示缩放工具
                                </label>
                            </div>
                        </div>

                        {/* 操作按钮 */}
                        <div className="flex gap-2 pt-4 border-t">
                            <button
                                onClick={handleSave}
                                className="flex-1 py-2 px-3 bg-slate-900 text-white text-sm rounded-lg hover:bg-slate-800 flex items-center justify-center gap-1">
                                <Save className="w-4 h-4" />
                                保存
                            </button>
                            <button
                                onClick={handleReset}
                                className="py-2 px-3 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200 flex items-center justify-center gap-1">
                                <RotateCcw className="w-4 h-4" />
                                重置
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
