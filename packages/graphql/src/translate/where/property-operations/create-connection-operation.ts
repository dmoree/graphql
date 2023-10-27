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

import Cypher from "@neo4j/cypher-builder";
import type { ConnectionField, ConnectionWhereArg, PredicateReturn } from "../../../types";
import type { Node, Relationship } from "../../../classes";
import type { WhereOperator } from "../types";
// Recursive function

import { createWherePredicateLegacy } from "../create-where-predicate";
import { asArray, filterTruthy } from "../../../utils/utils";
import { getLogicalPredicate, isLogicalOperator } from "../../utils/logical-operators";
import { createRelationPredicate } from "./create-relationship-operation";
import { getCypherRelationshipDirection } from "../../../utils/get-relationship-direction";
import type { Neo4jGraphQLTranslationContext } from "../../../types/neo4j-graphql-translation-context";

export function createConnectionOperation({
    connectionField,
    value,
    context,
    parentNode,
    operator,
    useExistExpr = true,
    checkParameterExistence,
}: {
    connectionField: ConnectionField;
    value: any;
    context: Neo4jGraphQLTranslationContext;
    parentNode: Cypher.Node;
    operator: string | undefined;
    useExistExpr?: boolean;
    checkParameterExistence?: boolean;
}): PredicateReturn {
    let nodeEntries: Record<string, any>;

    if (!connectionField?.relationship.union) {
        nodeEntries = { [connectionField.relationship.typeMeta.name]: value };
    } else {
        nodeEntries = value;
    }

    let subqueries: Cypher.CompositeClause | undefined;
    const operations: (Cypher.Predicate | undefined)[] = [];
    const matchPatterns: Cypher.Pattern[] = [];

    Object.entries(nodeEntries).forEach((entry) => {
        let nodeOnValue: string | undefined = undefined;
        const nodeOnObj = entry[1]?.node?._on;
        if (nodeOnObj) {
            nodeOnValue = Object.keys(nodeOnObj)[0];
        }

        let refNode = context.nodes.find((x) => x.name === nodeOnValue || x.name === entry[0]) as Node;
        if (!refNode) {
            refNode = context.nodes.find((x) => x.interfaces.some((i) => i.name.value === entry[0])) as Node;
        }

        const relationField = connectionField.relationship;

        const childNode = new Cypher.Node();

        const relationship = new Cypher.Relationship({ type: relationField.type });

        const direction = getCypherRelationshipDirection(relationField);
        const matchPattern = new Cypher.Pattern(parentNode)
            .withoutLabels()
            .related(relationship)
            .withDirection(direction)
            .to(childNode);

        const contextRelationship = context.relationships.find(
            (x) => x.name === connectionField.relationshipTypeName
        ) as Relationship;

        matchPatterns.push(matchPattern);

        const { predicate, preComputedSubqueries } = createRelationPredicate({
            targetNode: childNode,
            targetPattern: matchPattern,
            targetRelationship: relationship,
            parentNode,
            refNode,
            context,
            relationField,
            whereInput: entry[1],
            whereOperator: operator as WhereOperator,
            refEdge: contextRelationship,
            useExistExpr,
            checkParameterExistence,
        });

        operations.push(predicate);
        subqueries = Cypher.concat(subqueries, preComputedSubqueries);
    });

    return {
        predicate: Cypher.and(...operations),
        preComputedSubqueries: subqueries,
    };
}

export function createConnectionWherePropertyOperation({
    context,
    whereInput,
    edgeRef,
    targetNode,
    node,
    edge,
    useExistExpr = true,
    checkParameterExistence,
}: {
    whereInput: ConnectionWhereArg;
    context: Neo4jGraphQLTranslationContext;
    node: Node;
    edge: Relationship;
    edgeRef: Cypher.Variable;
    targetNode: Cypher.Node;
    useExistExpr?: boolean;
    checkParameterExistence?: boolean;
}): PredicateReturn {
    const preComputedSubqueriesResult: (Cypher.CompositeClause | undefined)[] = [];
    const params: (Cypher.Predicate | undefined)[] = [];
    Object.entries(whereInput).forEach(([key, value]) => {
        if (isLogicalOperator(key)) {
            const subOperations: (Cypher.Predicate | undefined)[] = [];
            asArray(value).forEach((input) => {
                const { predicate, preComputedSubqueries } = createConnectionWherePropertyOperation({
                    context,
                    whereInput: input,
                    edgeRef,
                    targetNode,
                    node,
                    edge,
                    useExistExpr,
                    checkParameterExistence,
                });
                subOperations.push(predicate);
                if (preComputedSubqueries && !preComputedSubqueries.empty)
                    preComputedSubqueriesResult.push(preComputedSubqueries);
            });

            const logicalPredicate = getLogicalPredicate(key, filterTruthy(subOperations));
            params.push(logicalPredicate);
            return;
        }

        if (key.startsWith("edge")) {
            const nestedProperties: Record<string, any> = value;
            const { predicate: result, preComputedSubqueries } = createWherePredicateLegacy({
                targetElement: edgeRef,
                whereInput: nestedProperties,
                context,
                element: edge,
                useExistExpr,
                checkParameterExistence,
            });

            params.push(result);
            if (preComputedSubqueries && !preComputedSubqueries.empty)
                preComputedSubqueriesResult.push(preComputedSubqueries);
            return;
        }

        if (key.startsWith("node") || key.startsWith(node.name)) {
            // TODO: improve nodeOn properties generation
            const nodeOnProperties = value._on?.[node.name] || {};
            const nestedProperties = { ...value, ...nodeOnProperties };
            delete nestedProperties._on;

            if (
                Object.keys(value as Record<string, any>).length === 1 &&
                value._on &&
                !Object.prototype.hasOwnProperty.call(value._on, node.name)
            ) {
                throw new Error("_on is used as the only argument and node is not present within");
            }

            const { predicate: result, preComputedSubqueries } = createWherePredicateLegacy({
                targetElement: targetNode,
                whereInput: nestedProperties,
                context,
                element: node,
                useExistExpr,
                checkParameterExistence,
            });

            // NOTE: _NOT is handled by the size()=0
            params.push(result);
            if (preComputedSubqueries && !preComputedSubqueries.empty)
                preComputedSubqueriesResult.push(preComputedSubqueries);
            return;
        }
    });
    return {
        predicate: Cypher.and(...filterTruthy(params)),
        preComputedSubqueries: preComputedSubqueriesResult.length
            ? Cypher.concat(...preComputedSubqueriesResult)
            : undefined,
    };
}

/** Checks if a where property has an explicit interface inside _on */
export function hasExplicitNodeInInterfaceWhere({
    whereInput,
    node,
}: {
    whereInput: ConnectionWhereArg;
    node: Node;
}): boolean {
    for (const [key, value] of Object.entries(whereInput)) {
        if (key.startsWith("node") || key.startsWith(node.name)) {
            if (
                Object.keys(value as Record<string, any>).length === 1 &&
                value._on &&
                !Object.prototype.hasOwnProperty.call(value._on, node.name)
            ) {
                return false;
            }

            return true;
        }
    }
    return true;
}
