import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ArtisCarousel } from './artis-carousel';

describe('ArtisCarousel', () => {
  let component: ArtisCarousel;
  let fixture: ComponentFixture<ArtisCarousel>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ArtisCarousel]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ArtisCarousel);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
