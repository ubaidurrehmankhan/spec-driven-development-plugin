# Test Patterns

## Service Unit Test

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, UpdateResult } from 'typeorm';
import { ProductService } from './product.service';
import { Product } from './entities/product.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

describe('ProductService', () => {
  let service: ProductService;
  let productRepository: jest.Mocked<Repository<Product>>;

  const mockProduct: Product = {
    id: 'product-123',
    name: 'Test Product',
    description: 'Test Description',
    price: 99.99,
    stock: 100,
    imageUrl: 'https://example.com/image.jpg',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductService,
        {
          provide: getRepositoryToken(Product),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
            findOne: jest.fn(),
            softDelete: jest.fn(),
            softRemove: jest.fn(),
            restore: jest.fn(),
          },
        },
        // Add other mocked dependencies here (cache, other repos, etc.)
      ],
    }).compile();

    service = module.get<ProductService>(ProductService);
    productRepository = module.get(getRepositoryToken(Product));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new product successfully', async () => {
      const dto: CreateProductDto = {
        name: 'Test Product',
        price: 99.99,
        stock: 100,
      };

      productRepository.create.mockReturnValue(mockProduct);
      productRepository.save.mockResolvedValue(mockProduct);

      const result = await service.create(dto);

      expect(result).toEqual(mockProduct);
      expect(productRepository.create).toHaveBeenCalledTimes(1);
      expect(productRepository.create).toHaveBeenCalledWith(dto);
      expect(productRepository.save).toHaveBeenCalledTimes(1);
      expect(productRepository.save).toHaveBeenCalledWith(mockProduct);
    });
  });

  describe('findOne', () => {
    it('should return a product by id', async () => {
      productRepository.findOne.mockResolvedValue(mockProduct);

      const result = await service.findOne('product-123');

      expect(result).toEqual(mockProduct);
      // @DeleteDateColumn filters soft-deleted rows automatically —
      // the service passes only `where: { id }`.
      expect(productRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'product-123' },
      });
    });

    it('should throw NotFoundException if product not found', async () => {
      productRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('product-123')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('should soft delete a product via repository.softDelete', async () => {
      productRepository.softDelete.mockResolvedValue({
        affected: 1,
        raw: [],
        generatedMaps: [],
      } as UpdateResult);

      await service.remove('product-123');

      expect(productRepository.softDelete).toHaveBeenCalledTimes(1);
      expect(productRepository.softDelete).toHaveBeenCalledWith('product-123');
    });

    it('should throw NotFoundException when softDelete affects 0 rows', async () => {
      productRepository.softDelete.mockResolvedValue({
        affected: 0,
        raw: [],
        generatedMaps: [],
      } as UpdateResult);

      await expect(service.remove('missing-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
```

### Service Test Structure

- `beforeEach`: Create testing module with mocked repos using `getRepositoryToken()`
- `afterEach`: `jest.clearAllMocks()`
- One `describe` per method
- One `it` per scenario: happy path, not found, validation error, cache hit/miss

### What to Mock in Services
- Repositories: `{ create, save, find, findOne, softDelete, softRemove, restore }` — all `jest.fn()`. Include the soft-delete family whenever the service uses `@DeleteDateColumn`.
- Cache manager: mock whatever API the injected cache uses.
  - Standard `@nestjs/cache-manager` → `{ get: jest.fn(), set: jest.fn(), del: jest.fn() }`.
  - Project-specific `ICustomCacheManager` → match its surface (e.g. `{ get, set, remove }`).
  - Do not mix: if the service calls `.del(...)`, the mock must expose `del` (and vice versa for `remove`). A mismatch is the classic reason "tests pass, prod cache-invalidation silently no-ops".
- External services: `{ someMethod: jest.fn() }`
- Other modules' exported services (see `internal-service-interface-patterns.md`): mock the injected service's methods the same way — `{ hasActiveContracts: jest.fn(), ... }`. Assert the consumer passes the documented arguments (e.g. `tenantId` explicitly), since the internal-interface contract's "what the consumer must NOT assume" section is often exactly the thing a mismatched test would hide.
- DataSource (for transactions): mock `createQueryRunner()` to return a mock queryRunner whose `manager` has the methods the code calls (`save`, `softDelete`, etc.)
- Queue/BullMQ producers, for a commit-then-enqueue method (see `service-patterns.md`'s async side-effects section): mock `queue.add()` and add a test for the enqueue-fails-after-commit path if the contract states a specific recovery behavior (reconciliation job, outbox) — assert that behavior, not just the happy path.

### Soft-delete assertions

When an entity uses `@DeleteDateColumn`, queries and deletions do NOT pass `where: { deletedAt: IsNull() }` or mutate `deletedAt` directly. Assert against the repository's soft-delete API instead:

```typescript
expect(repo.softDelete).toHaveBeenCalledWith(id);
// or, when cascading:
expect(repo.softRemove).toHaveBeenCalledWith(entity);
```

For read paths, assert the `where` clause contains only the lookup key (no manual `deletedAt` filter).

---

## Controller Unit Test

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';
import { CreateProductDto } from './dto/create-product.dto';
import { Product } from './entities/product.entity';
import JwtGuard from '../auth/jwt-guard';
import { RoleGuard } from '../common/guards/role.guard';

describe('ProductController', () => {
  let controller: ProductController;
  let productService: jest.Mocked<ProductService>;

  const mockProduct: Product = {
    id: 'product-123',
    name: 'Test Product',
    description: 'Test Description',
    price: 99.99,
    stock: 100,
    imageUrl: 'https://example.com/image.jpg',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProductController],
      providers: [
        {
          provide: ProductService,
          useValue: {
            create: jest.fn(),
            findAll: jest.fn(),
            findOne: jest.fn(),
            update: jest.fn(),
            remove: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(JwtGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RoleGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ProductController>(ProductController);
    productService = module.get(ProductService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new product', async () => {
      const dto: CreateProductDto = {
        name: 'Test Product',
        price: 99.99,
        stock: 100,
      };

      productService.create.mockResolvedValue(mockProduct);

      const result = await controller.create(dto);

      expect(result).toEqual(mockProduct);
      expect(productService.create).toHaveBeenCalledWith(dto);
    });
  });

  describe('findAll', () => {
    it('should return all products', async () => {
      productService.findAll.mockResolvedValue([mockProduct]);

      const result = await controller.findAll();

      expect(result).toEqual([mockProduct]);
    });
  });

  describe('error handling', () => {
    it('should propagate service errors', async () => {
      productService.findOne.mockRejectedValue(new Error('Not found'));

      await expect(controller.findOne('invalid')).rejects.toThrow('Not found');
    });
  });
});
```

### Controller Test Structure

- Mock the entire service (all methods as `jest.fn()`)
- Override guards: `.overrideGuard(JwtGuard).useValue({ canActivate: () => true })`
- Test that controller calls correct service method with correct args
- Test error propagation (service throws → controller propagates)
- For a nested route (2+ path ID segments), add a test asserting the service is called with both IDs and that a mismatched child/parent pair produces the documented not-found/forbidden result — this is the executable counterpart of `../owasp-security/SKILL.md` section 1

### Zero Failures Policy

**All tests must pass. Not a single failure is allowed.**

- If any test fails after generation, diagnose and fix immediately
- Do NOT move on to the next step until every test is green
- Re-run the full test suite after every fix to ensure no regressions
- If a test is flaky, fix the root cause — never skip or disable it

### Test Coverage Targets

- **Lines**: ≥ 90%
- **Statements**: ≥ 90%
- **Functions**: ≥ 90%
- **Branches**: ≥ 90%

**Excluded from the coverage denominator** (configure via Jest `coveragePathIgnorePatterns`):
- `src/migrations/**` — exercised by integration tests against a real DB, not unit-tested
- `src/main.ts` — bootstrap
- `**/*.module.ts` — declarative DI wiring
- Generated code (`*.generated.ts`, `*.d.ts`)

Business logic (services, controllers, guards, interceptors, pipes, filters) must hit the 90% gate. Do not widen exclusions to game coverage.

Cover these scenarios for each method:
1. Happy path
2. Not found / empty result
3. Error propagation
4. Partial updates (for update methods)
5. Edge cases (zero values, empty strings, etc.)

### Test Quality Rules

- Use `jest.fn()` — avoid full mock class implementations
- Use exact assertions: `expect(result).toBe(5)` not `expect(result).toBeTruthy()`
- Each test must be independent — no shared mutable state
- `afterEach(() => jest.clearAllMocks())` in every describe block
- Mock at boundaries (repos, external services, other modules' injected services), not internal methods

## Note on this plugin's single verify pass

This skill governs unit tests written during `implement-batch` (build +
lint + the module's own tests must pass before the batch is considered
done). Cross-batch, cross-module, and contract-conformance verification
(does the internal-interface method's actual signature match what
`docs/contracts/*.internal-interface.md` says, does the HTTP contract match
the Swagger output) is **not** repeated here — it happens once, across all
batches, in `verify-and-test` per this plugin's dropped-per-batch-verify
design.
