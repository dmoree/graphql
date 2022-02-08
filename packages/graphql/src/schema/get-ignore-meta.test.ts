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

import { FieldDefinitionNode, Kind } from "graphql";
import getIgnoreMeta, { ERROR_MESSAGE } from "./get-ignore-meta";

describe("getIgnoreMeta", () => {
    test("should return undefined if no directive found", () => {
        // @ts-ignore
        const field: FieldDefinitionNode = {
            directives: [
                {
                    // @ts-ignore
                    name: { value: "RANDOM 1" },
                },
                {
                    // @ts-ignore
                    name: { value: "RANDOM 2" },
                },
                {
                    // @ts-ignore
                    name: { value: "RANDOM 3" },
                },
                {
                    // @ts-ignore
                    name: { value: "RANDOM 4" },
                },
            ],
        };

        const result = getIgnoreMeta(field);

        expect(result).toBeUndefined();
    });

    test("should throw if dependsOn not a string", () => {
        const field: FieldDefinitionNode = {
            directives: [
                {
                    // @ts-ignore
                    name: {
                        value: "ignore",
                        // @ts-ignore
                    },
                    arguments: [
                        {
                            // @ts-ignore
                            name: { value: "dependsOn" },
                            // @ts-ignore
                            value: { kind: Kind.BOOLEAN },
                        },
                    ],
                },
                {
                    // @ts-ignore
                    name: { value: "RANDOM 2" },
                },
                {
                    // @ts-ignore
                    name: { value: "RANDOM 3" },
                },
                {
                    // @ts-ignore
                    name: { value: "RANDOM 4" },
                },
            ],
        };

        expect(() => getIgnoreMeta(field)).toThrow(ERROR_MESSAGE);
    });

    test("should return the correct meta if no select argument", () => {
        const field: FieldDefinitionNode = {
            directives: [
                {
                    // @ts-ignore
                    name: {
                        value: "ignore",
                        // @ts-ignore
                    },
                },
                {
                    // @ts-ignore
                    name: { value: "RANDOM 2" },
                },
                {
                    // @ts-ignore
                    name: { value: "RANDOM 3" },
                },
                {
                    // @ts-ignore
                    name: { value: "RANDOM 4" },
                },
            ],
        };

        const result = getIgnoreMeta(field);

        expect(result).toMatchObject({});
    });

    test("should return the correct meta with dependsOn argument", () => {
        const selection = "{ field1 field2 field3 }";
        const field: FieldDefinitionNode = {
            directives: [
                {
                    // @ts-ignore
                    name: {
                        value: "ignore",
                        // @ts-ignore
                    },
                    arguments: [
                        {
                            // @ts-ignore
                            name: { value: "dependsOn" },
                            // @ts-ignore
                            value: {
                                kind: Kind.STRING,
                                value: selection,
                            },
                        },
                    ],
                },
                {
                    // @ts-ignore
                    name: { value: "RANDOM 2" },
                },
                {
                    // @ts-ignore
                    name: { value: "RANDOM 3" },
                },
                {
                    // @ts-ignore
                    name: { value: "RANDOM 4" },
                },
            ],
        };

        const result = getIgnoreMeta(field);

        expect(result).toMatchObject({
            selection,
        });
    });
});
