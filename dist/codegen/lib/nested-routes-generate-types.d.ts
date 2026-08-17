/** A combined-routes descriptor for a child owned by a parent through a direct foreign key (`/:parentId/<segment>`). */
export interface DirectFkDescriptor {
    kind: "direct-fk";
    parent: string;
    parentParam: string;
    parentBasePath: string;
    child: {
        name: string;
    };
    fkColumn: string;
    segment: string;
    segmentTail: string;
}
/** A combined-routes descriptor for a many-to-many child reached through a junction row (`/:parentId/<segment>/:targetId`). */
export interface M2mDescriptor {
    kind: "m2m";
    parent: string;
    parentParam: string;
    parentBasePath: string;
    junction: string;
    target: string;
    targetParam: string;
    parentFkField: string;
    childFkField: string;
    segment: string;
    segmentTail: string;
}
/** Either nested-route shape a `nestedRouterGenerators[kind]` dispatch can hand an generator; the exported generators narrow on `kind`. */
export type NestedRouteDescriptor = DirectFkDescriptor | M2mDescriptor;
