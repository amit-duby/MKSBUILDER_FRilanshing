class BaseRepository {
  constructor(model) {
    this.model = model;
  }

  create(data) {
    return this.model.create(data);
  }

  findById(id) {
    return this.model.findById(id);
  }

  async paginate({ filter, page, limit, sort, populate, lean = true, select, estimateTotal = false }) {
    const skip = (page - 1) * limit;
    let query = this.model.find(filter).sort(sort).skip(skip).limit(limit);
    if (select) query = query.select(select);
    if (populate) query = query.populate(populate);
    if (lean) query = query.lean({ virtuals: true });

    const totalPromise = estimateTotal && (!filter || Object.keys(filter).length === 0)
      ? this.model.estimatedDocumentCount()
      : this.model.countDocuments(filter);

    const [items, total] = await Promise.all([
      query,
      totalPromise,
    ]);

    const normalized = lean
      ? items.map((item) => {
        if (item && item._id && item.id == null) item.id = String(item._id);
        if (item) delete item.__v;
        return item;
      })
      : items;

    return {
      items: normalized,
      meta: {
        page,
        limit,
        total,
        totalPages: total === 0 ? 1 : Math.ceil(total / limit),
      },
    };
  }
}

module.exports = BaseRepository;
