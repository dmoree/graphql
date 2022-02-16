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

import { mergeDeep } from "@graphql-tools/utils";
import { Node } from "../classes";
import createProjectionAndParams from "./create-projection-and-params";
import { GraphQLOptionsArg, Context, ConnectionField, RelationField, GraphQLWhereArg, GraphQLSortArg } from "../types";
import createAuthAndParams from "./create-auth-and-params";
import { AUTH_FORBIDDEN_ERROR } from "../constants";
import createConnectionAndParams from "./connection/create-connection-and-params";
import createInterfaceProjectionAndParams from "./create-interface-projection-and-params";
import createTopLevelMatchWhereAndParams from "./create-top-level-match-where-and-params";
import createElementWhereAndParams from "./where/create-element-where-and-params";

type FulltextArg = { phrase: string; score_EQUAL?: number };
type GraphQLFulltextArg = FulltextArg | Record<string, FulltextArg>;

function translateRead({
    object,
    context,
}: {
    context: Context;
    object: {
        node?: Node;
        union?: { name: string; nodes: Node[] };
        interface?: { name: string; nodes: Node[] };
    };
}): [string, any] {
    const { resolveTree } = context;
    const varName = "this";

    const optionsInput = (resolveTree.args.options || {}) as GraphQLOptionsArg;
    let limitStr = "";
    let offsetStr = "";
    let sortStr = "";

    let cypherParams: { [k: string]: any } = {};
    const connectionStrs: string[] = [];
    const interfaceStrs: string[] = [];

    const whereInput = (resolveTree.args.where ?? {}) as GraphQLWhereArg;
    const fulltextInput = (resolveTree.args.fulltext ?? {}) as GraphQLFulltextArg;
    const isAbstractType = Boolean(object.union || object.interface);

    const nodes = [
        ...(object.union?.nodes ?? []),
        ...(object.interface?.nodes ?? []),
        ...(object.node ? [object.node] : []),
    ];

    const nodeSubquery = nodes
        .map((node) => {
            const queryLimit = node.queryOptions?.getLimit(optionsInput.limit);
            if (queryLimit) {
                if (!isAbstractType) {
                    optionsInput.limit = queryLimit;
                } else {
                    cypherParams = mergeDeep([cypherParams, { [`${varName}_${node.name}_limit`]: queryLimit }]);
                }
            }
            const [match, matchWhere, matchParams] = createTopLevelMatchWhereAndParams({
                node,
                context,
                varName,
                fulltextInput: isAbstractType ? fulltextInput[node.name] ?? {} : fulltextInput,
            });

            const [authAllow, authAllowParams] = createAuthAndParams({
                operations: "READ",
                entity: node,
                context,
                allow: {
                    parentNode: node,
                    varName,
                },
            });

            const [nodeWhere, nodeWhereParams] = createElementWhereAndParams({
                whereInput: transformWhere({ isAbstractType, whereInput, nodeName: node.name }),
                varName,
                element: node,
                context,
                // recursing: true,
                parameterPrefix: isAbstractType ? `${varName}.${node.name}` : varName,
            });

            const [authWhere, authWhereParams] = createAuthAndParams({
                operations: "READ",
                entity: node,
                context,
                where: { varName, node },
            });

            const [projection, projectionParams, projectionMeta] = createProjectionAndParams({
                resolveTree,
                node,
                context,
                varName,
                resolveType: isAbstractType,
            });

            if (projectionMeta?.connectionFields?.length) {
                projectionMeta.connectionFields.forEach((connectionResolveTree) => {
                    const connectionField = node.connectionFields.find(
                        (x) => x.fieldName === connectionResolveTree.name
                    ) as ConnectionField;
                    const connection = createConnectionAndParams({
                        resolveTree: connectionResolveTree,
                        field: connectionField,
                        context,
                        nodeVariable: varName,
                    });
                    connectionStrs.push(connection[0]);
                    cypherParams = { ...cypherParams, ...connection[1] };
                });
            }

            if (projectionMeta?.interfaceFields?.length) {
                projectionMeta.interfaceFields.forEach((interfaceResolveTree) => {
                    const relationshipField = node.relationFields.find(
                        (x) => x.fieldName === interfaceResolveTree.name
                    ) as RelationField;
                    const interfaceProjection = createInterfaceProjectionAndParams({
                        resolveTree: interfaceResolveTree,
                        field: relationshipField,
                        context,
                        node,
                        nodeVariable: varName,
                    });
                    interfaceStrs.push(interfaceProjection.cypher);
                    cypherParams = { ...cypherParams, ...interfaceProjection.params };
                });
            }

            const where = [
                ...matchWhere,
                nodeWhere,
                authWhere,
                projectionMeta?.authValidateStrs?.length
                    ? `apoc.util.validatePredicate(NOT(${projectionMeta.authValidateStrs.join(
                          " AND "
                      )}), "${AUTH_FORBIDDEN_ERROR}", [0])`
                    : "",
            ]
                .filter(Boolean)
                .join(" AND ");
            cypherParams = mergeDeep([
                cypherParams,
                matchParams,
                authAllowParams,
                authWhereParams,
                projectionParams,
                !isEmptyObject(nodeWhereParams)
                    ? {
                          [varName]: transformWhereParams({
                              isAbstractType,
                              params: nodeWhereParams,
                              nodeName: node.name,
                          }),
                      }
                    : {},
            ]);

            return [
                match,
                where ? `WHERE ${where}` : "",
                authAllow ? `CALL apoc.util.validate(NOT(${authAllow}), "${AUTH_FORBIDDEN_ERROR}", [0])` : "",
                ...connectionStrs,
                ...interfaceStrs,
                `${isAbstractType ? "RETURN" : "WITH"} ${varName} ${projection} AS ${varName}`,
                isAbstractType && queryLimit ? `LIMIT $${varName}_${node.name}_limit` : "",
            ]
                .filter(Boolean)
                .join("\n");
        })
        .join("\nUNION\n");

    if (optionsInput) {
        const hasOffset = Boolean(optionsInput.offset) || optionsInput.offset === 0;

        if (hasOffset) {
            offsetStr = `SKIP $${varName}_offset`;
            cypherParams[`${varName}_offset`] = optionsInput.offset;
        }

        if (optionsInput.limit) {
            limitStr = `LIMIT $${varName}_limit`;
            cypherParams[`${varName}_limit`] = optionsInput.limit;
        }

        if (optionsInput.sort && optionsInput.sort.length) {
            const sortArr = optionsInput.sort.reduce((res: string[], sort: GraphQLSortArg) => {
                return [
                    ...res,
                    ...Object.entries(sort).map(([field, direction]) => {
                        return `${varName}.${field} ${direction}`;
                    }),
                ];
            }, []);

            sortStr = `ORDER BY ${sortArr.join(", ")}`;
        }
    }

    const cypher = [
        isAbstractType ? ["CALL {", nodeSubquery, "}"].join("\n") : nodeSubquery,
        `RETURN ${varName}`,
        ...(sortStr ? [sortStr] : []),
        offsetStr,
        limitStr,
    ]
        .filter(Boolean)
        .join("\n");

    return [cypher, cypherParams];
}

export default translateRead;

const transformWhere = ({
    isAbstractType,
    whereInput,
    nodeName,
}: {
    isAbstractType: boolean;
    whereInput: GraphQLWhereArg;
    nodeName: string;
}) => {
    if (!isAbstractType) {
        return whereInput;
    }
    // TODO: Interface where _on
    return whereInput[nodeName] ?? {};
};

const transformWhereParams = ({
    isAbstractType,
    params,
    nodeName,
}: {
    isAbstractType: boolean;
    params: Record<string, any>;
    nodeName: string;
}) => {
    if (!isAbstractType) {
        return params;
    }
    return { [nodeName]: params };
};

const isEmptyObject = (obj: Record<string, any>) => Object.keys(obj).length === 0;
