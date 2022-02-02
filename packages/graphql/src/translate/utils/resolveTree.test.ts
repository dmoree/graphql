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

import { ResolveTree } from "graphql-parse-resolve-info";
import { generate } from "randomstring";
import {
    generateResolveTree,
    generateMissingOrAliasedResolveTrees,
    getByFieldNameInSelection,
    getAliasedByFieldNameInSelection,
} from "./resolveTree";

describe("resolveTree", () => {
    const names = ["field1", "field2", "field3"];

    const nonAliasedSelection: ResolveTree[] = names.map((name) => ({
        alias: name,
        name,
        fieldsByTypeName: {},
        args: {},
    }));

    const aliasedSelection: ResolveTree[] = names.map((name) => {
        const alias = generate({ charset: "alphabetic" });
        return {
            alias,
            name,
            fieldsByTypeName: {},
            args: {},
        };
    });

    test("generate resolve tree", () => {
        const name = generate({ charset: "alphabetic" });

        const resolveTree = generateResolveTree({ name });

        expect(resolveTree).toStrictEqual({
            name,
            alias: name,
            fieldsByTypeName: {},
            args: {},
        });
    });

    test("generate aliased resolve tree", () => {
        const alias = generate({ charset: "alphabetic" });
        const name = generate({ charset: "alphabetic" });

        const resolveTree = generateResolveTree({ name, alias });

        expect(resolveTree).toStrictEqual({
            name,
            alias,
            fieldsByTypeName: {},
            args: {},
        });
    });

    test("get resolve tree by field name", () => {
        const resolveTree = getByFieldNameInSelection(nonAliasedSelection, names[2]);
        expect(resolveTree).toStrictEqual(nonAliasedSelection[2]);
    });

    test("get aliased resolve tree by field name", () => {
        const resolveTree = getAliasedByFieldNameInSelection(aliasedSelection, names[1]);
        expect(resolveTree).toStrictEqual(aliasedSelection[1]);
    });

    test("generate missing resolve trees", () => {
        const missingFieldNames = Array(3)
            .fill(null)
            .map(() => generate({ charset: "alphabetic" }));

        const resolveTrees = generateMissingOrAliasedResolveTrees({
            selection: nonAliasedSelection,
            fieldNames: [...names, ...missingFieldNames],
        });

        expect(resolveTrees).toStrictEqual(
            missingFieldNames.map((name) => ({ name, alias: name, fieldsByTypeName: {}, args: {} }))
        );
    });

    test("generate aliased and missing resolve trees", () => {
        const missingFieldNames = Array(3)
            .fill(null)
            .map(() => generate({ charset: "alphabetic" }));
        const resolveTrees = generateMissingOrAliasedResolveTrees({
            selection: aliasedSelection,
            fieldNames: [...names, ...missingFieldNames],
        });

        expect(resolveTrees).toStrictEqual(
            [...names, ...missingFieldNames].map((name) => ({ name, alias: name, fieldsByTypeName: {}, args: {} }))
        );
    });
});
