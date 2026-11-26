-- s15-08 calc-graphs: a graph a member saved from RMHCalculator, with the validated result it was plotted to.
CREATE TABLE "calc_graph" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" VARCHAR(80) NOT NULL,
    "functions" TEXT[],
    "domainMin" DOUBLE PRECISION,
    "domainMax" DOUBLE PRECISION,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calc_graph_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "calc_graph_userId_updatedAt_idx" ON "calc_graph"("userId", "updatedAt" DESC);

-- AddForeignKey
ALTER TABLE "calc_graph" ADD CONSTRAINT "calc_graph_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
