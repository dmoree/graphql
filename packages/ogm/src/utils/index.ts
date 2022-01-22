import { Neo4jGraphQL } from "@neo4j/graphql";
import { Kind, TypeNode } from "graphql";
import pluralize from "pluralize";
import { lowerFirst } from "./lower-first";

export { default as filterDocument } from "./filter-document";

export function getReferenceNode(schema: Neo4jGraphQL, relationField: any) {
    return schema.nodes.find((x) => x.name === relationField.typeMeta.name);
}

export function pluralizeName(name: string) {
    return lowerFirst(pluralize(name));
}

export function getName(type: TypeNode): string {
    return type.kind === Kind.NAMED_TYPE ? type.name.value : getName(type.type);
}
