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

import { gql } from "apollo-server";
import { graphql } from "graphql";
import { Driver } from "neo4j-driver";
import { generate } from "randomstring";
import neo4j from "../neo4j";
import { Neo4jGraphQL } from "../../../src";

const testLabel = generate({ charset: "alphabetic" });
describe("https://github.com/neo4j/graphql/issues/879", () => {
    let driver: Driver;
    const typeDefs = gql`
        type Object {
            id: ID!
            children: [Object!]! @relationship(type: "CHILDREN", direction: OUT)
            users: [User!]! @relationship(type: "MEMBER_OF", direction: IN)
            allUsersOfChildren: [User!]!
                @cypher(
                    statement: """
                    MATCH (this)-[:CHILDREN*]->(:Object)<-[:MEMBER_OF]-(user:User)
                    RETURN user
                    """
                )
        }

        type User {
            id: ID!
            object: Object! @relationship(type: "MEMBER_OF", direction: OUT)
        }
    `;

    const { schema } = new Neo4jGraphQL({ typeDefs });

    const users = Array(4)
        .fill(null)
        .map(() => ({ id: generate() }));

    const objects = Array(14)
        .fill(null)
        .map(() => ({ id: generate() }));

    const memberships = [
        [users[0], objects[2]],
        [users[1], objects[5]],
        [users[2], objects[6]],
        [users[3], objects[12]],
    ];

    beforeAll(async () => {
        driver = await neo4j();
        const session = driver.session();
        await session.run(
            `
              FOREACH(i in range(0, size($users) - 1) | CREATE (:User:${testLabel} {id: $users[i].id}))
              FOREACH(j in range(0, size($objects) - 1) | CREATE (:Object:${testLabel} {id: $objects[j].id}))
              
              // Each Object is a child of the previous Object
              WITH [x in range(0, size($objects) - 2) | [$objects[x].id, $objects[x+1].id]] as ancestors
              CALL {
                  WITH ancestors
                  UNWIND ancestors as ancestor
                  MATCH (parent:Object {id: ancestor[0]}), (child:Object {id: ancestor[1]})
                  MERGE (parent)-[:CHILDREN]->(child)
              }
              
              // Create membership relationship as defined in $memberships
              CALL {
                  UNWIND $memberships as membership
                  MATCH (user:User {id: membership[0].id}), (object:Object {id: membership[1].id})
                  MERGE (user)-[:MEMBER_OF]->(object)
              }
            `,
            { users, objects, memberships }
        );
        await session.close();
    });

    afterAll(async () => {
        const session = driver.session();
        await session.run(`MATCH (node:${testLabel}) DETACH DELETE node`);
        await session.close();
        await driver.close();
    });

    test("should query cypher connection", async () => {
        const query = gql`
            query ($objectId: ID!) {
                objects(where: { id: $objectId }) {
                    id
                    allUsersOfChildrenConnection {
                        totalCount
                        edges {
                            node {
                                id
                            }
                        }
                    }
                }
            }
        `;

        const gqlResult = await graphql({
            schema,
            source: query.loc!.source,
            contextValue: { driver },
            variableValues: { objectId: objects[0].id },
        });

        expect(gqlResult.errors).toBeUndefined();

        const gqlObject = (gqlResult.data as any)?.objects[0];

        expect(gqlObject).toBeDefined();
        expect(gqlObject).toEqual({
            id: objects[0].id,
            allUsersOfChildrenConnection: {
                totalCount: users.length,
                edges: expect.arrayContaining(users.map((user) => ({ node: user }))),
            },
        });
    });

    test("should query cypher connection further down", async () => {
        const query = gql`
            query ($objectId: ID!) {
                objects(where: { id: $objectId }) {
                    id
                    allUsersOfChildrenConnection {
                        totalCount
                        edges {
                            node {
                                id
                            }
                        }
                    }
                }
            }
        `;

        const gqlResult = await graphql({
            schema,
            source: query.loc!.source,
            contextValue: { driver },
            variableValues: { objectId: objects[5].id },
        });

        expect(gqlResult.errors).toBeUndefined();

        const gqlObject = (gqlResult.data as any)?.objects[0];

        expect(gqlObject).toBeDefined();
        expect(gqlObject).toEqual({
            id: objects[5].id,
            allUsersOfChildrenConnection: {
                totalCount: 2,
                edges: expect.arrayContaining([{ node: users[2] }, { node: users[3] }]),
            },
        });
    });

    test("should filter cypher connection", async () => {
        const query = gql`
            query ($objectId: ID!, $userId: ID!) {
                objects(where: { id: $objectId }) {
                    id
                    allUsersOfChildrenConnection(where: { node: { id: $userId } }) {
                        totalCount
                        edges {
                            node {
                                id
                            }
                        }
                    }
                }
            }
        `;

        const gqlResult = await graphql({
            schema,
            source: query.loc!.source,
            contextValue: { driver },
            variableValues: { objectId: objects[0].id, userId: users[2].id },
        });

        expect(gqlResult.errors).toBeUndefined();

        const gqlObject = (gqlResult.data as any)?.objects[0];

        expect(gqlObject).toBeDefined();
        expect(gqlObject).toEqual({
            id: objects[0].id,
            allUsersOfChildrenConnection: {
                totalCount: 1,
                edges: [{ node: users[2] }],
            },
        });
    });
});
