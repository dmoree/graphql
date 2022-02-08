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

import { Driver } from "neo4j-driver";
import { graphql } from "graphql";
import { generate } from "randomstring";
import neo4j from "../neo4j";
import { Neo4jGraphQL } from "../../../src/classes";

const testLabel = generate({ charset: "alphabetic" });
describe("@ignore directive", () => {
    let driver: Driver;

    beforeAll(async () => {
        driver = await neo4j();
    });

    afterAll(async () => {
        await driver.close();
    });

    describe("Invalid selection sets", () => {});

    describe("Scalar fields", () => {
        const typeDefs = `
            type User {
                id: ID!
                firstName: String!
                lastName: String!
                fullName: String @ignore(dependsOn: "{ firstName lastName }")
            }
        `;

        const user = {
            id: generate(),
            firstName: generate({ charset: "alphabetic" }),
            lastName: generate({ charset: "alphabetic" }),
        };

        const fullName = ({ firstName, lastName }) => `${firstName} ${lastName}`;

        const resolvers = {
            User: { fullName },
        };

        const { schema } = new Neo4jGraphQL({ typeDefs, resolvers });

        beforeAll(async () => {
            const session = driver.session();
            await session.run(
                `
                CREATE (user:User:${testLabel}) SET user = $user
            `,
                { user }
            );
            await session.close();
        });

        afterAll(async () => {
            const session = driver.session();
            await session.run(`MATCH (n:${testLabel}) DETACH DELETE n`);
            await session.close();
        });

        test("resolves field with custom resolver with required fields in selection set", async () => {
            const source = `
                query Users($userId: ID!) {
                    users(where: { id: $userId }) {
                        id
                        firstName
                        lastName
                        fullName
                    }
                }
            `;

            const gqlResult = await graphql({
                schema,
                source,
                contextValue: { driver },
                variableValues: { userId: user.id },
            });

            expect(gqlResult.errors).toBeFalsy();
            expect((gqlResult.data as any).users[0]).toEqual({
                ...user,
                fullName: fullName(user),
            });
        });

        test("resolves field with custom resolver without required fields in selection set", async () => {
            const source = `
                query Users($userId: ID!) {
                    users(where: { id: $userId }) {
                        id
                        fullName
                    }
                }
            `;

            const gqlResult = await graphql({
                schema,
                source,
                contextValue: { driver },
                variableValues: { userId: user.id },
            });

            expect(gqlResult.errors).toBeFalsy();
            expect((gqlResult.data as any).users[0]).toEqual({
                id: user.id,
                fullName: fullName(user),
            });
        });

        test("resolves field with custom resolver with required field(s) aliased in selection set", async () => {
            const source = `
                query Users($userId: ID!) {
                    users(where: { id: $userId }) {
                        id
                        f: firstName
                        fullName
                    }
                }
            `;

            const gqlResult = await graphql({
                schema,
                source,
                contextValue: { driver },
                variableValues: { userId: user.id },
            });

            expect(gqlResult.errors).toBeFalsy();
            expect((gqlResult.data as any).users[0]).toEqual({
                id: user.id,
                f: user.firstName,
                fullName: fullName(user),
            });
        });
    });

    describe("Cypher fields", () => {
        const user = {
            id: generate(),
            firstName: generate({ charset: "alphabetic" }),
            lastName: generate({ charset: "alphabetic" }),
        };

        const typeDefs = `
            type User {
                id: ID!
                firstName: String! @cypher(statement: "RETURN '${user.firstName}'")
                lastName: String! @cypher(statement: "RETURN '${user.lastName}'")
                fullName: String @ignore(dependsOn: "{firstName lastName}")
            }
        `;

        const fullName = ({ firstName, lastName }) => `${firstName} ${lastName}`;

        const resolvers = {
            User: { fullName },
        };

        const { schema } = new Neo4jGraphQL({ typeDefs, resolvers });

        beforeAll(async () => {
            const session = driver.session();
            await session.run(
                `
                CREATE (user:User:${testLabel}) SET user.id = $userId
            `,
                { userId: user.id }
            );
            await session.close();
        });

        afterAll(async () => {
            const session = driver.session();
            await session.run(`MATCH (n:${testLabel}) DETACH DELETE n`);
            await session.close();
        });

        test("removes a field from all but its object type, and resolves with a custom resolver", async () => {
            const source = `
                query Users($userId: ID!) {
                    users(where: { id: $userId }) {
                        id
                        firstName
                        lastName
                        fullName
                    }
                }
            `;

            const gqlResult = await graphql({
                schema,
                source,
                contextValue: { driver },
                variableValues: { userId: user.id },
            });

            expect(gqlResult.errors).toBeFalsy();
            expect((gqlResult.data as any).users[0]).toEqual({
                ...user,
                fullName: fullName(user),
            });
        });

        test("resolves field with custom resolver without required fields in selection set", async () => {
            const source = `
                query Users($userId: ID!) {
                    users(where: { id: $userId }) {
                        id
                        fullName
                    }
                }
            `;

            const gqlResult = await graphql({
                schema,
                source,
                contextValue: { driver },
                variableValues: { userId: user.id },
            });

            expect(gqlResult.errors).toBeFalsy();
            expect((gqlResult.data as any).users[0]).toEqual({
                id: user.id,
                fullName: fullName(user),
            });
        });

        test("resolves field with custom resolver with required field(s) aliased in selection set", async () => {
            const source = `
                query Users($userId: ID!) {
                    users(where: { id: $userId }) {
                        id
                        f: firstName
                        fullName
                    }
                }
            `;

            const gqlResult = await graphql({
                schema,
                source,
                contextValue: { driver },
                variableValues: { userId: user.id },
            });

            expect(gqlResult.errors).toBeFalsy();
            expect((gqlResult.data as any).users[0]).toEqual({
                id: user.id,
                f: user.firstName,
                fullName: fullName(user),
            });
        });
    });

    describe("Relationship fields", () => {
        const typeDefs = `
            type User {
                id: ID!
                firstName: String!
                lastName: String!
                friends: [User!]! @relationship(type: "FRIENDS_WITH", direction: OUT)
                friendIds: [ID!]! @ignore(dependsOn: "{ friends { id friends { id } } }")
            }
        `;

        const friendIds = ({ friends }) => friends.map((friend) => friend.id);

        const resolvers = {
            User: { friendIds },
        };

        const { schema } = new Neo4jGraphQL({ typeDefs, resolvers });

        const users = Array(3)
            .fill(null)
            .map(() => ({
                id: generate(),
                firstName: generate({ charset: "alphabetic", readable: true }),
                lastName: generate({ charset: "alphabetic", readable: true }),
            }));
        beforeAll(async () => {
            const session = driver.session();
            await session.run(
                `
                CREATE (user1:User:${testLabel}) SET user1 = $users[0]
                CREATE (user2:User:${testLabel}) SET user2 = $users[1]
                CREATE (user3:User:${testLabel}) SET user3 = $users[2]

                CREATE (user1)<-[:FRIENDS_WITH {since: datetime()}]-(user2)-[:FRIENDS_WITH {since: datetime() - duration("P1Y")}]->(user3)
                CREATE (user1)-[:FRIENDS_WITH]->(user3)
            `,
                { users }
            );
            await session.close();
        });

        afterAll(async () => {
            const session = driver.session();
            await session.run(`MATCH (n:${testLabel}) DETACH DELETE n`);
            await session.close();
        });

        test("resolves field with custom resolver with required fields in selection set", async () => {
            const source = `
                query Users($userId: ID!) {
                    users(where: { id: $userId }) {
                        id
                        friends {
                            id
                            friends {
                                id
                            }
                        }
                        friendIds
                    }
                }
            `;

            const gqlResult = await graphql({
                schema,
                source,
                contextValue: { driver },
                variableValues: { userId: users[1].id },
            });

            expect(gqlResult.errors).toBeFalsy();
            expect((gqlResult.data as any).users[0]).toEqual({
                id: users[1].id,
                friends: expect.arrayContaining([
                    { id: users[0].id, friends: [{ id: users[2].id }] },
                    { id: users[2].id, friends: [] },
                ]),
                friendIds: expect.arrayContaining([users[0].id, users[2].id]),
            });
        });

        test("throw error if field with custom resolver with required fields in selection set having differing arguments", async () => {
            const source = `
                query Users($userId: ID!, $friendId: ID!) {
                    users(where: { id: $userId }) {
                        id
                        friends(where: { id: $friendId }) {
                            id
                            friends {
                                id
                            }
                        }
                        friendIds
                    }
                }
            `;

            const gqlResult = await graphql({
                schema,
                source,
                contextValue: { driver },
                variableValues: { userId: users[1].id, friendId: users[0].id },
            });

            expect(gqlResult.errors).toBeTruthy();
        });

        test("throw error if field with custom resolver with required fields in selection set having differing arguments further down", async () => {
            const source = `
                query Users($userId: ID!, $friendId: ID!) {
                    users(where: { id: $userId }) {
                        id
                        friends {
                            id
                            friends(where: { id: $friendId }) {
                                id
                            }
                        }
                        friendIds
                    }
                }
            `;

            const gqlResult = await graphql({
                schema,
                source,
                contextValue: { driver },
                variableValues: { userId: users[1].id, friendId: users[0].id },
            });

            expect(gqlResult.errors).toBeTruthy();
        });

        test("resolve if field with custom resolver with required fields in selection set having differing arguments further down is aliased", async () => {
            const source = `
                query Users($userId: ID!, $friendId: ID!) {
                    users(where: { id: $userId }) {
                        id
                        friends {
                            id
                            aliased: friends(where: { id: $friendId }) {
                                id
                            }
                        }
                        friendIds
                    }
                }
            `;

            const gqlResult = await graphql({
                schema,
                source,
                contextValue: { driver },
                variableValues: { userId: users[1].id, friendId: users[0].id },
            });

            expect(gqlResult.errors).toBeFalsy();

            expect((gqlResult.data as any).users[0]).toEqual({
                id: users[1].id,
                friends: expect.arrayContaining([
                    { id: users[0].id, aliased: [] },
                    { id: users[2].id, aliased: [] },
                ]),
                friendIds: expect.arrayContaining([users[0].id, users[2].id]),
            });
        });

        test("resolves field with custom resolver with required fields not in selection set", async () => {
            const source = `
                query Users($userId: ID!) {
                    users(where: { id: $userId }) {
                        id
                        friendIds
                    }
                }
            `;

            const gqlResult = await graphql({
                schema,
                source,
                contextValue: { driver },
                variableValues: { userId: users[1].id },
            });

            expect(gqlResult.errors).toBeFalsy();
            expect((gqlResult.data as any).users[0]).toEqual({
                id: users[1].id,
                friendIds: expect.arrayContaining([users[0].id, users[2].id]),
            });
        });
    });

    describe("Connection fields", () => {
        const users = Array(3)
            .fill(null)
            .map(() => ({
                id: generate(),
                firstName: generate({ charset: "alphabetic", readable: true }),
                lastName: generate({ charset: "alphabetic", readable: true }),
            }));
        const typeDefs = `
            type User {
                id: ID!
                firstName: String!
                lastName: String!
                friends: [User!]! @relationship(type: "FRIENDS_WITH", direction: OUT)
                friendIdsFromConnection: [ID!]!
                    @ignore(
                        dependsOn: """
                        {
                            friendsConnection {
                                totalCount
                                edges {
                                    node {
                                        id
                                        friends {
                                            id
                                        }
                                    }
                                }
                            }
                        }
                        """
                    )
            }
        `;

        const friendIdsFromConnection = ({ friendsConnection }) => friendsConnection.edges.map(({ node }) => node.id);

        const resolvers = {
            User: { friendIdsFromConnection },
        };

        const { schema } = new Neo4jGraphQL({ typeDefs, resolvers });

        beforeAll(async () => {
            const session = driver.session();
            await session.run(
                `
                CREATE (user1:User:${testLabel}) SET user1 = $users[0]
                CREATE (user2:User:${testLabel}) SET user2 = $users[1]
                CREATE (user3:User:${testLabel}) SET user3 = $users[2]

                CREATE (user1)<-[:FRIENDS_WITH {since: datetime()}]-(user2)-[:FRIENDS_WITH {since: datetime() - duration("P1Y")}]->(user3)
                CREATE (user1)-[:FRIENDS_WITH]->(user3)
            `,
                { users }
            );
            await session.close();
        });

        afterAll(async () => {
            const session = driver.session();
            await session.run(`MATCH (n:${testLabel}) DETACH DELETE n`);
            await session.close();
        });

        test("resolves field with custom resolver with required fields in selection set", async () => {
            const source = `
                query Users($userId: ID!) {
                    users(where: { id: $userId }) {
                        id
                        friendsConnection {
                            totalCount
                            edges {
                                node {
                                    id
                                    friends {
                                        id
                                    }
                                }
                            }
                        }
                        friendIdsFromConnection
                    }
                }
            `;

            const gqlResult = await graphql({
                schema,
                source,
                contextValue: { driver },
                variableValues: { userId: users[1].id, friendId: users[0].id },
            });

            expect(gqlResult.errors).toBeFalsy();
            expect((gqlResult.data as any).users[0]).toEqual({
                id: users[1].id,
                friendsConnection: {
                    totalCount: 2,
                    edges: expect.arrayContaining([
                        { node: { id: users[0].id, friends: [{ id: users[2].id }] } },
                        { node: { id: users[2].id, friends: [] } },
                    ]),
                },
                friendIdsFromConnection: expect.arrayContaining([users[0].id, users[2].id]),
            });
        });

        test("throw error if field with custom resolver with required fields in selection set having differing arguments", async () => {
            const source = `
                query Users($userId: ID!, $friendId: ID!) {
                    users(where: { id: $userId }) {
                        id
                        friendsConnection {
                            totalCount
                            edges {
                                node {
                                    id
                                    friends(where: {id: $friendId}) {
                                        id
                                    }
                                }
                            }
                        }
                        friendIdsFromConnection
                    }
                }
            `;

            const gqlResult = await graphql({
                schema,
                source,
                contextValue: { driver },
                variableValues: { userId: users[1].id, friendId: users[0].id },
            });

            expect(gqlResult.errors).toBeTruthy();
        });

        test("resolve if field with custom resolver with required fields in selection set having differing arguments is aliased", async () => {
            const source = `
                query Users($userId: ID!, $friendId: ID!) {
                    users(where: { id: $userId }) {
                        id
                        aliased: friendsConnection(where: { node: { id: $friendId } }) {
                            totalCount
                            edges {
                                node {
                                    id
                                    friends {
                                        id
                                    }
                                }
                            }
                        }
                        friendIdsFromConnection
                    }
                }
            `;

            const gqlResult = await graphql({
                schema,
                source,
                contextValue: { driver },
                variableValues: { userId: users[1].id, friendId: users[0].id },
            });

            expect(gqlResult.errors).toBeFalsy();
            expect((gqlResult.data as any).users[0]).toEqual({
                id: users[1].id,
                aliased: {
                    totalCount: 1,
                    edges: expect.arrayContaining([{ node: { id: users[0].id, friends: [{ id: users[2].id }] } }]),
                },
                friendIdsFromConnection: expect.arrayContaining([users[0].id, users[2].id]),
            });
        });

        test("resolves field with custom resolver with required fields not in selection set", async () => {
            const source = `
                query Users($userId: ID!) {
                    users(where: { id: $userId }) {
                        id
                        friendIdsFromConnection
                    }
                }
            `;

            const gqlResult = await graphql({
                schema,
                source,
                contextValue: { driver },
                variableValues: { userId: users[1].id },
            });

            expect(gqlResult.errors).toBeFalsy();
            expect((gqlResult.data as any).users[0]).toEqual({
                id: users[1].id,
                friendIdsFromConnection: expect.arrayContaining([users[0].id, users[2].id]),
            });
        });
    });
});
