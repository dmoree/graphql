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
import { BaseField } from "../../types";
import { removeDuplicates } from "../../utils/utils";

/* Finds a field of selection based on field name */
export function getByFieldNameInSelection(resolveTrees: ResolveTree[], fieldName: string) {
    return resolveTrees.find((resolveTree) => resolveTree.name === fieldName);
}

/* Finds a aliased field of selection based on field name */
export function getAliasedByFieldNameInSelection(resolveTrees: ResolveTree[], fieldName: string) {
    return resolveTrees.find((resolveTree) => resolveTree.name === fieldName && resolveTree.alias !== fieldName);
}

export function filterFieldsInSelection<T extends BaseField>(resolveTrees: ResolveTree[], fields: T[]) {
    return fields.filter((field) => resolveTrees.find((resolveTree) => resolveTree.name === field.fieldName));
}

/* Generates a field to be used in creating projections */
export const generateResolveTree = ({
    name,
    alias,
    args = {},
    fieldsByTypeName = {},
}: Pick<ResolveTree, "name"> & Partial<ResolveTree>): ResolveTree => {
    return {
        alias: alias ?? name,
        name,
        args,
        fieldsByTypeName,
    };
};

/* Generates missing fields based on an array of fieldNames */
export const generateMissingOrAliasedResolveTrees = ({
    fieldNames,
    selection,
}: {
    selection: ResolveTree[];
    fieldNames: string[];
}): ResolveTree[] => {
    return removeDuplicates(fieldNames).reduce((acc, fieldName) => {
        const exists = getByFieldNameInSelection(selection, fieldName);
        const aliased = getAliasedByFieldNameInSelection(selection, fieldName);
        if (!exists || aliased) {
            return [...acc, generateResolveTree({ name: fieldName })];
        }
        return acc;
    }, [] as ResolveTree[]);
};
