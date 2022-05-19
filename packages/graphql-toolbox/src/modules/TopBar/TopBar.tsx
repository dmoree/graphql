/*
 * Copyright (c) "Neo4j"
 * Neo4j Sweden AB [http://neo4j.com]
 *
 * This file is part of Neo4j.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Fragment, useContext } from "react";
import { Button, HeroIcon } from "@neo4j-ndl/react";
// @ts-ignore - SVG Import
import Neo4jLogoIcon from "../../assets/Neo4j-logo-color.svg";
import { AuthContext } from "../../contexts/auth";
import { SettingsContext } from "../../contexts/settings";
import { Screen, ScreenContext } from "../../contexts/screen";

export const TopBar = () => {
    const auth = useContext(AuthContext);
    const settings = useContext(SettingsContext);
    const screen = useContext(ScreenContext);
    const greenDot = <span className="ml-1 mr-1 h-2 w-2 bg-green-400 rounded-full inline-block" />;
    const redDot = <span className="ml-1 mr-1 h-2 w-2 bg-red-400 rounded-full inline-block" />;

    const handleHelpClick = () => {
        settings.setIsShowHelpDrawer(!settings.isShowHelpDrawer);
    };

    const handleSettingsClick = () => {
        settings.setIsShowSettingsDrawer(!settings.isShowSettingsDrawer);
    };

    return (
        <div className="flex w-full h-16 bg-white border-b border-gray-100">
            <div className="flex-1 flex justify-start">
                <div className="flex items-center justify-space">
                    <img src={Neo4jLogoIcon} alt="Neo4j logo Icon" className="ml-8 w-24" />
                    <p className="ml-8 text-base">GraphQL Toolbox</p>
                </div>
            </div>
            <div className="flex-1 flex justify-center">
                <div className="flex items-center justify-space">
                    <p className="mr-2">{auth?.isConnected ? greenDot : redDot} </p>
                    <div className="flex items-center">
                        <span className="max-width-db-name truncate">{auth.selectedDatabaseName}</span>&#64;
                        {auth?.connectUrl}
                    </div>
                    {auth.databases?.length ? (
                        <Fragment>
                            <span className="mx-2">/</span>
                            <select
                                name="databaseselection"
                                className="w-36 cursor-pointer px-2 py-1 rounded border border-gray-100"
                                data-test-topbar-database-selection
                                value={auth.selectedDatabaseName}
                                disabled={screen.view !== Screen.TYPEDEFS}
                                onChange={(event) => auth.setSelectedDatabaseName(event.target.value)}
                            >
                                {auth.databases.map((db) => {
                                    return (
                                        <option key={db.name} value={db.name}>
                                            {db.name}
                                            {/* {db.home ? " - home" : ""} */}
                                        </option>
                                    );
                                })}
                            </select>
                        </Fragment>
                    ) : null}
                </div>
            </div>
            <div className="flex-1 flex justify-end">
                <div className="flex items-center justify-space text-sm">
                    {!auth.isNeo4jDesktop ? (
                        <div className="mr-6 pr-2 border-r border-gray-700">
                            <Button
                                data-test-topbar-disconnect-button
                                color="primary"
                                fill="text"
                                onClick={() => {
                                    auth?.logout();
                                }}
                            >
                                <div className="flex items-center">
                                    <HeroIcon className="h-7 w-7 mr-3" iconName="LogoutIcon" type="outline" />
                                    <div className="pt-02">Disconnect</div>
                                </div>
                            </Button>
                        </div>
                    ) : null}
                    <div className="flex items-center">
                        <div className="cursor-pointer mr-4">
                            <HeroIcon
                                data-test-topbar-help-button
                                onClick={handleHelpClick}
                                className="h-7 w-7"
                                iconName="QuestionMarkCircleIcon"
                                type="outline"
                            />
                        </div>
                        <div
                            className="ml-2 mr-6 cursor-pointer"
                            data-test-topbar-settings-button
                            onClick={handleSettingsClick}
                        >
                            <HeroIcon className="h-7 w-7" iconName="CogIcon" type="outline" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};