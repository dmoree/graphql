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

import {
    SelectionSetNode,
    GraphQLObjectType,
    SelectionNode,
    GraphQLSchema,
    GraphQLCompositeType,
    Kind,
    GraphQLUnionType,
    getNamedType,
    GraphQLNamedType,
    isCompositeType,
} from "graphql";
import { FieldsByTypeName, ResolveTree } from "graphql-parse-resolve-info";
import { getArgumentValues } from "@graphql-tools/utils";
import { Node } from "../../classes";
import { BaseField, Context } from "../../types";
import { removeDuplicates } from "../../utils/utils";

/** Finds a resolve tree of selection based on field name */
export function getResolveTreeByFieldName({
    fieldName,
    selection,
}: {
    fieldName: string;
    selection: Record<string, ResolveTree>;
}) {
    return Object.values(selection).find((resolveTree) => resolveTree.name === fieldName);
}

/** Finds an aliased resolve tree of selection based on field name */
export function getAliasedResolveTreeByFieldName({
    fieldName,
    selection,
}: {
    fieldName: string;
    selection: Record<string, ResolveTree>;
}) {
    return Object.values(selection).find(
        (resolveTree) => resolveTree.name === fieldName && resolveTree.alias !== fieldName
    );
}

export function filterFieldsInSelection<T extends BaseField>({
    fields,
    selection,
}: {
    fields: T[];
    selection: Record<string, ResolveTree>;
}) {
    return fields.filter((field) => Object.values(selection).find((f) => f.name === field.fieldName));
}

/** Generates a field to be used in creating projections */
export function generateProjectionField({
    name,
    alias,
    args = {},
    fieldsByTypeName = {},
}: Pick<ResolveTree, "name"> & Partial<ResolveTree>): Record<string, ResolveTree> {
    return {
        [name]: {
            name,
            alias: alias ?? name,
            args,
            fieldsByTypeName,
        },
    };
}

/** Generates missing fields based on an array of fieldNames */
export function generateMissingOrAliasedFields({
    fieldNames,
    selection,
}: {
    selection: Record<string, ResolveTree>;
    fieldNames: string[];
}): Record<string, ResolveTree> {
    return removeDuplicates(fieldNames).reduce((acc, fieldName) => {
        const exists = getResolveTreeByFieldName({ fieldName, selection });
        const aliased = getAliasedResolveTreeByFieldName({ fieldName, selection });
        if (!exists || aliased) {
            return { ...acc, ...generateProjectionField({ name: fieldName }) };
        }
        return acc;
    }, {});
}

export function checkArgs(selection: Record<string, ResolveTree>, merged: Record<string, ResolveTree>) {
    const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
    const compareArgs = (a: any, b: any) => {
        if (a === b) return true;
        if (!isObject(a) || !isObject(b)) return false;
        const aKeys = Object.keys(a);
        const bKeys = Object.keys(b);
        return (
            aKeys.length === bKeys.length && aKeys.every((key) => bKeys.includes(key) && compareArgs(a[key], b[key]))
        );
    };
    Object.keys(merged)
        .filter((key) => Object.keys(selection).includes(key))
        .forEach((key) => {
            if (!compareArgs(merged[key].args, selection[key].args)) {
                throw new Error(`Argument mismatch. Either remove or alias field: \`${key}\``);
            }
            Object.keys(merged[key].fieldsByTypeName)
                .filter((k) => Object.keys(selection[key].fieldsByTypeName).includes(k))
                .forEach((k) => checkArgs(selection[key].fieldsByTypeName[k], merged[key].fieldsByTypeName[k]));
        });
}

interface ParseOptions {
    keepRoot?: boolean;
    deep?: boolean;
}

export function parseNodeSelectionSet(node: Node, selectionSet: SelectionSetNode, context: Context) {
    const parentType = context.neoSchema.schema.getType(node.name) as GraphQLObjectType;
    const tree = fieldTreeFromAST({
        asts: selectionSet.selections,
        schema: context.neoSchema.schema,
        parentType,
        options: { deep: true },
    });
    return tree[node.name];
}

export function fieldTreeFromAST<T extends SelectionNode>({
    asts,
    schema,
    parentType,
    fieldsByTypeName = {},
    options = {},
}: {
    asts: ReadonlyArray<T> | T;
    schema: GraphQLSchema;
    parentType: GraphQLCompositeType;
    fieldsByTypeName?: FieldsByTypeName;
    options?: ParseOptions;
}): FieldsByTypeName {
    const selectionNodes: ReadonlyArray<T> = Array.isArray(asts) ? asts : [asts];
    if (!fieldsByTypeName[parentType.name]) {
        fieldsByTypeName[parentType.name] = {};
    }
    return selectionNodes.reduce((tree, selectionNode: SelectionNode) => {
        if (selectionNode.kind === Kind.FIELD) {
            if (parentType instanceof GraphQLUnionType) {
                return tree;
            }
            const name = selectionNode.name.value;
            const alias = selectionNode.alias?.value ?? name;
            const field = parentType.getFields()[name];
            if (!field) {
                return tree;
            }
            const fieldType = getNamedType(field.type) as GraphQLNamedType | undefined;
            if (!fieldType) {
                return tree;
            }
            const args = getArgumentValues(field, selectionNode);
            if (!tree[parentType.name][alias]) {
                const newTreeRoot: ResolveTree = {
                    name,
                    alias,
                    args,
                    fieldsByTypeName: isCompositeType(fieldType) ? { [fieldType.name]: {} } : {},
                };
                tree[parentType.name][alias] = newTreeRoot;
            }
            if (selectionNode.selectionSet && options.deep && isCompositeType(fieldType)) {
                fieldTreeFromAST({
                    asts: selectionNode.selectionSet.selections,
                    schema,
                    parentType: fieldType,
                    fieldsByTypeName: tree[parentType.name][alias].fieldsByTypeName,
                    options,
                });
            }
        } else if (selectionNode.kind === Kind.INLINE_FRAGMENT && options.deep) {
            let fragmentType: GraphQLNamedType | null | undefined = parentType;
            if (selectionNode.typeCondition) {
                fragmentType = schema.getType(selectionNode.typeCondition.name.value);
            }
            if (fragmentType && isCompositeType(fragmentType)) {
                fieldTreeFromAST({
                    asts: selectionNode.selectionSet.selections,
                    schema,
                    parentType: fragmentType,
                    fieldsByTypeName: tree,
                    options,
                });
            }
        }
        return tree;
    }, fieldsByTypeName);
}
