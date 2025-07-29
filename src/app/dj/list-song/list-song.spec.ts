import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ListSong } from './list-song';

describe('ListSong', () => {
  let component: ListSong;
  let fixture: ComponentFixture<ListSong>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ListSong]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ListSong);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
